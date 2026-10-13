"""
Monthly payroll attendance metrics per employee: Present, Absent, Weekoff, Holiday,
Salary-eligible days.

Period end is min(month_end, today, max(attendance.date in month)) whenever that employee has
live rows in ``public.attendance`` for that month — not the max date from ``monthly_attendance``
snapshots alone. Snapshot days still merge in *within* that window so OT/SF shows on saved days,
but phantom absents past the last posted DB date no longer inflate counts.

Uses public.attendance + public.monthly_attendance.stored_data (same UX as Leave).
"""

from __future__ import annotations

import calendar
import json
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Set, Tuple

from database.supabase_client import SupabaseRest
from services.monthly_snapshot_cache import load_year_snapshots
from services.working_hours import hhmm_value_to_minutes, minutes_to_hhmm_float


def _parse_date_only(raw: Any) -> Optional[date]:
    if raw in (None, ""):
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


def _normalize_stored_data(raw: Any) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [x for x in parsed if isinstance(x, dict)]
        except json.JSONDecodeError:
            return []
    return []


def _load_holidays_range(supabase: SupabaseRest, start: date, end: date) -> Dict[str, str]:
    try:
        rows = supabase.select(
            table="holidays",
            select="holiday_date,name",
            where_gte={"holiday_date": start.isoformat()},
            where_lte={"holiday_date": end.isoformat()},
            limit=500,
        )
    except Exception:
        return {}
    out: Dict[str, str] = {}
    for r in rows or []:
        dk = str(r.get("holiday_date") or "")[:10]
        if dk:
            out[dk] = str(r.get("name") or "Holiday").strip()
    return out


def _load_monthly_snapshots(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    month: int,
    year: int,
) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    for sr in load_year_snapshots(supabase, year):
        try:
            if int(sr.get("month") or 0) != int(month):
                continue
        except (TypeError, ValueError):
            continue
        eid = str(sr.get("employee_id") or "")
        if eid in employee_ids:
            out[eid] = _normalize_stored_data(sr.get("stored_data"))
    return out


def _snapshot_item_to_row(item: Dict[str, Any]) -> Dict[str, Any]:
    d = item.get("date")
    return {
        "date": str(d)[:10] if d is not None else "",
        "status": item.get("status"),
        "final_status": item.get("status_ot_sf") or item.get("final_status"),
        "working_hours": item.get("working_hours"),
        "check_in": item.get("in_time") or item.get("check_in"),
        "check_out": item.get("out_time") or item.get("check_out"),
    }


def _fetch_attendance_table_rows(
    supabase: SupabaseRest,
    month_start: date,
    query_end: date,
) -> List[Dict[str, Any]]:
    if query_end < month_start:
        return []
    try:
        return supabase.select(
            table="attendance",
            select="employee_id,date,status,final_status,working_hours,check_in,check_out",
            where_gte={"date": month_start.isoformat()},
            where_lte={"date": query_end.isoformat()},
            limit=500_000,
        )
    except Exception:
        return []


def _is_weekoff_label(fs: str) -> bool:
    fs = fs.strip().lower()
    if not fs:
        return False
    keys = ("sunday", "saturday", "weekend", "week off", "weekoff")
    return any(k in fs for k in keys)


def _is_present_label(fs: str) -> bool:
    fs = fs.strip().lower()
    if fs in ("", "ok", "present"):
        return True
    if "late" in fs or "overtime" in fs or fs == "ot":
        return True
    if "shortfall" in fs or fs == "sf":
        return True
    if fs.startswith("ot") or " ot" in fs:
        return True
    return False


_HOLIDAY_FS_MARKERS = ("holiday", "may day", "festival", "national")

# Match `payroll_absent_ot_sf_audit.sql`: absent as a token (non-alphanumeric boundaries), not "not absent".
_ABSENT_OT_SF = re.compile(
    r"(^|[^0-9A-Za-z])absent([^0-9A-Za-z]|$)",
    re.IGNORECASE,
)


def _fs_indicates_holiday_text(fsl: str) -> bool:
    return any(x in fsl for x in _HOLIDAY_FS_MARKERS)


def _ot_sf_indicates_absent(fs: str) -> bool:
    """True when Status OT/SF (final_status) marks the day absent — authoritative over raw status P/A."""
    t = fs.strip()
    if not t:
        return False
    tl = t.lower()
    if "not absent" in tl:
        return False
    return bool(_ABSENT_OT_SF.search(t))


def _classify_day(
    d: date,
    row: Optional[Dict[str, Any]],
    holiday_names: Dict[str, str],
) -> str:
    """
    One of: holiday, absent, weekoff, present, neutral (ignored for salary buckets).

    Calendar holidays are paid (holiday bucket), never absent.
    Status OT/SF (`final_status`) decides present vs absent whenever it is explicit; raw P/A is
    only used when OT/SF is blank (e.g. legacy rows). So P + OT/SF "Absent" still counts absent.
    """
    iso = d.isoformat()
    if iso in holiday_names:
        return "holiday"

    # Always treat Sunday as paid week-off (never absent payroll), aligned with Leave "Total Used".
    if row and d.weekday() == 6:
        return "weekoff"
    if not row:
        if d.weekday() == 6:
            return "weekoff"
        if d.weekday() == 5:
            return "weekoff"
        return "neutral"

    st = str(row.get("status") or "").strip().upper()
    fs = str(row.get("final_status") or "").strip()
    fsl = fs.lower()

    if _is_weekoff_label(fs):
        return "weekoff"

    if _fs_indicates_holiday_text(fsl):
        return "holiday"

    # OT/SF wins over raw status (fixes P + final_status Absent in DB).
    if _ot_sf_indicates_absent(fs):
        return "absent"

    if fsl and _is_present_label(fs):
        return "present"

    if st == "A":
        return "absent"
    if st == "P":
        return "present"

    return "neutral"


def _merge_employee_rows(
    table_rows: List[Dict[str, Any]],
    snapshot_items: List[Dict[str, Any]],
) -> Dict[date, Dict[str, Any]]:
    """Prefer attendance table over snapshot per date."""
    by_date: Dict[date, Dict[str, Any]] = {}
    for item in snapshot_items:
        r = _snapshot_item_to_row(item)
        dd = _parse_date_only(r.get("date"))
        if dd:
            by_date[dd] = r
    for r in table_rows:
        dd = _parse_date_only(r.get("date"))
        if dd:
            by_date[dd] = {
                "date": dd.isoformat(),
                "status": r.get("status"),
                "final_status": r.get("final_status") or r.get("status_ot_sf"),
                "working_hours": r.get("working_hours"),
                "check_in": r.get("check_in"),
                "check_out": r.get("check_out"),
            }
    return by_date


def _payroll_period_cap(
    month_start: date,
    month_end: date,
    today: date,
    table_rows_in_month: List[Dict[str, Any]],
    merged_keys: List[date],
) -> date:
    """
    End date (inclusive) for counting payroll buckets.

    If the employee has any ``public.attendance`` rows in-range, cap strictly at their latest DB
    date so ``monthly_attendance.stored_data`` cannot extend classification past last posted punch.
    """
    dlim = min(month_end, today)
    td: List[date] = []
    for r in table_rows_in_month or []:
        dd = _parse_date_only(r.get("date"))
        if dd is not None and month_start <= dd <= month_end:
            td.append(dd)
    if td:
        return min(dlim, max(td))
    if merged_keys:
        return min(dlim, max(merged_keys))
    return dlim


def _rows_source_for_employee(
    table_rows: List[Dict[str, Any]],
    snapshot_items: List[Dict[str, Any]],
) -> Dict[date, Dict[str, Any]]:
    """
    Merge monthly snapshot with `public.attendance`. For each calendar date, the DB row wins
    so saved Status / OT/SF is authoritative; snapshot-only days still count (older months).
    """
    return _merge_employee_rows(table_rows, snapshot_items)


def compute_payroll_attendance_metrics(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    month: int,
    year: int,
    *,
    today: Optional[date] = None,
    period_start_by_eid: Optional[Dict[str, date]] = None,
    period_end_by_eid: Optional[Dict[str, date]] = None,
) -> Tuple[Dict[str, Dict[str, Any]], Dict[str, List[Dict[str, Any]]]]:
    """
    Returns (metrics_by_employee_id, raw_attendance_rows_by_employee_for_ui).
    metrics values: present_days, absent_days, weekoff_days, holiday_days,
    salary_eligible_days, attendance_period_start, attendance_period_end (iso|None)

    ``period_start_by_eid`` (joining date / first attendance upload per employee) excludes
    week-offs / holidays / absents before that date from every bucket; ``period_end_by_eid``
    (left date) excludes days after it.
    """
    d = today or date.today()
    empty_m = {eid: _empty_metrics() for eid in employee_ids}
    empty_r: Dict[str, List[Dict[str, Any]]] = {eid: [] for eid in employee_ids}
    if not employee_ids or not (1 <= month <= 12):
        return empty_m, empty_r

    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])
    if month_start > d:
        return empty_m, empty_r

    query_end_fetch = min(month_end, d)
    with ThreadPoolExecutor(max_workers=3) as pool:
        fut_holidays = pool.submit(_load_holidays_range, supabase, month_start, query_end_fetch)
        fut_rows = pool.submit(_fetch_attendance_table_rows, supabase, month_start, query_end_fetch)
        fut_snaps = pool.submit(_load_monthly_snapshots, supabase, employee_ids, month, year)
        holiday_names = fut_holidays.result()
        att_all = fut_rows.result()
        snaps = fut_snaps.result()

    by_eid_table: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in att_all or []:
        eid = str(row.get("employee_id") or "")
        if eid in employee_ids:
            by_eid_table[eid].append(row)

    metrics: Dict[str, Dict[str, Any]] = {}
    rows_out: Dict[str, List[Dict[str, Any]]] = {}

    for eid in employee_ids:
        table_rows = by_eid_table.get(eid, []) or []
        merged = _rows_source_for_employee(table_rows, snaps.get(eid, []))
        dates_known = sorted(merged.keys())
        cap = _payroll_period_cap(month_start, month_end, d, table_rows, dates_known)
        cap = min(cap, (period_end_by_eid or {}).get(eid) or cap)
        start = max(month_start, (period_start_by_eid or {}).get(eid) or month_start)

        present = absent = weekoff = holiday = 0
        hours_total_minutes = 0

        for day in _daterange(start, cap):
            row = merged.get(day)
            bucket = _classify_day(day, row, holiday_names)
            if bucket == "holiday":
                holiday += 1
            elif bucket == "absent":
                absent += 1
            elif bucket == "weekoff":
                weekoff += 1
            elif bucket == "present":
                present += 1

        for dd, row in sorted(merged.items()):
            if not (start <= dd <= cap):
                continue
            wh = row.get("working_hours")
            if wh not in (None, ""):
                try:
                    hours_total_minutes += hhmm_value_to_minutes(wh)
                except Exception:
                    pass

        salary_eligible = present + weekoff + holiday
        cal_dim = calendar.monthrange(year, month)[1]
        metrics[eid] = {
            "present_days": present,
            "absent_days": absent,
            "weekoff_days": weekoff,
            "holiday_days": holiday,
            "salary_eligible_days": salary_eligible,
            "attendance_period_start": start.isoformat() if start <= cap else None,
            "attendance_period_end": cap.isoformat() if cap >= month_start else None,
            "calendar_days_in_month": cal_dim,
            "total_working_minutes": hours_total_minutes,
        }
        rows_out[eid] = [
            {"date": k.isoformat(), **{kk: vv for kk, vv in v.items() if kk != "date"}}
            for k, v in sorted(merged.items())
            if start <= k <= cap
        ][:200]

    return metrics, rows_out


def _empty_metrics() -> Dict[str, Any]:
    return {
        "present_days": 0,
        "absent_days": 0,
        "weekoff_days": 0,
        "holiday_days": 0,
        "salary_eligible_days": 0,
        "attendance_period_start": None,
        "attendance_period_end": None,
        "calendar_days_in_month": 0,
        "total_working_minutes": 0,
    }


def _daterange(a: date, b: date):
    cur = a
    while cur <= b:
        yield cur
        cur += timedelta(days=1)

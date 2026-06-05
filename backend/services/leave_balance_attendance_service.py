"""
Attendance-driven leave deductions for a selected calendar month.

Primary data:
  - public.attendance (employee_id, date, status) — status 'A' = Absent (Atten. column).
  - public.monthly_attendance.stored_data (JSON) — same shape as the Attendance UI; used when
    present so "Total Used" matches the grid even if absents were not yet synced to attendance.

Absent rows without punch-in are now persisted to public.attendance (see attendance_management_service).
"""

from __future__ import annotations

import calendar
import json
import re
from collections import defaultdict
from datetime import date
from typing import Any, Dict, List, Optional, Set, Tuple

from database.supabase_client import SupabaseRest


def _parse_row_date(row: Dict[str, Any]) -> Optional[date]:
    raw = row.get("date")
    if raw in (None, ""):
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


def _normalize_stored_data(raw: Any) -> List[Dict[str, Any]]:
    """Supabase JSONB vs string JSON → list of day dicts."""
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


def _holiday_dates_in_range(supabase: SupabaseRest, start: date, end: date) -> Set[str]:
    try:
        rows = supabase.select(
            table="holidays",
            select="holiday_date",
            where_gte={"holiday_date": start.isoformat()},
            where_lte={"holiday_date": end.isoformat()},
            limit=500,
        )
    except Exception:
        return set()
    out: Set[str] = set()
    for r in rows or []:
        dk = str(r.get("holiday_date") or "")[:10]
        if dk:
            out.add(dk)
    return out


_ABSENT_TOKEN_RE = re.compile(r"(^|[^0-9A-Za-z])absent([^0-9A-Za-z]|$)", flags=re.IGNORECASE)


def _ot_sf_indicates_absent(fs: Any) -> bool:
    """
    Mirror payroll logic: some rows can have status != 'A' but still be marked Absent by
    final_status/status_ot_sf.
    """
    tl = str(fs or "")
    if not tl:
        return False
    if "not absent" in tl.lower():
        return False
    return bool(_ABSENT_TOKEN_RE.search(tl))


def _is_absent_status(row: Dict[str, Any]) -> bool:
    # Primary: raw attendance status.
    if str(row.get("status") or "").strip().upper() == "A":
        return True

    # Fallback: OT/SF (authoritative present/absent classification).
    return _ot_sf_indicates_absent(row.get("final_status") or row.get("status_ot_sf"))


def _fetch_attendance_month_slice(
    supabase: SupabaseRest,
    month_start: date,
    query_end: date,
) -> List[Dict[str, Any]]:
    if query_end < month_start:
        return []
    try:
        return supabase.select(
            table="attendance",
            select="employee_id,date,status,final_status",
            where_gte={"date": month_start.isoformat()},
            where_lte={"date": query_end.isoformat()},
            limit=500_000,
        )
    except Exception:
        return []


def _leave_period_cap(
    month_start: date,
    month_end: date,
    today: date,
    table_rows: List[Dict[str, Any]],
    known_dates: List[date],
) -> date:
    """
    Cap leave counting at the employee's latest posted attendance DB date when rows exist,
    so snapshot placeholder absents past that date do not inflate Total Used / YTD balance.
    """
    dlim = min(month_end, today)
    table_dates: List[date] = []
    for row in table_rows or []:
        dd = _parse_row_date(row)
        if dd is not None and month_start <= dd <= month_end:
            table_dates.append(dd)
    if table_dates:
        return min(dlim, max(table_dates))
    if known_dates:
        return min(dlim, max(known_dates))
    return dlim


def _merge_leave_day_rows(
    table_rows: List[Dict[str, Any]],
    day_rows: List[Dict[str, Any]],
) -> Dict[date, Dict[str, Any]]:
    """Merge snapshot with attendance table; DB row wins per date."""
    by_date: Dict[date, Dict[str, Any]] = {}
    for item in day_rows:
        dd = _parse_row_date(item)
        if dd is not None:
            by_date[dd] = dict(item)
    for row in table_rows:
        dd = _parse_row_date(row)
        if dd is not None:
            merged = dict(by_date.get(dd, {}))
            merged.update(row)
            by_date[dd] = merged
    return by_date


def _is_countable_leave_absent(
    row: Dict[str, Any],
    day: date,
    holidays: Set[str],
    *,
    has_table_row: bool,
) -> bool:
    if day.weekday() == 6 or day.isoformat() in holidays:
        return False
    if not _is_absent_status(row):
        return False
    # Count any Absent day classification that falls within the capped leave period.
    # (No extra "id" gating — Attendance grid "Absent" is the source of truth for Total Used.)
    return True


def _count_absent_from_merged_days(
    merged: Dict[date, Dict[str, Any]],
    table_row_dates: Set[date],
    month_start: date,
    period_end: date,
    holidays: Set[str],
) -> int:
    seen: Set[date] = set()
    n = 0
    for day in sorted(merged.keys()):
        if day < month_start or day > period_end:
            continue
        row = merged[day]
        if not _is_countable_leave_absent(
            row,
            day,
            holidays,
            has_table_row=day in table_row_dates,
        ):
            continue
        if day in seen:
            continue
        seen.add(day)
        n += 1
    return n


def _load_monthly_snapshots_by_employee_months(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    months: Set[int],
    year: int,
) -> Dict[Tuple[str, int], List[Dict[str, Any]]]:
    out: Dict[Tuple[str, int], List[Dict[str, Any]]] = {}
    if not months:
        return out
    try:
        snap_rows = supabase.select(
            table="monthly_attendance",
            select="employee_id,month,stored_data",
            where_eq={"year": year},
            limit=5000,
        )
    except Exception:
        return out
    for sr in snap_rows or []:
        try:
            m = int(sr.get("month") or 0)
        except (TypeError, ValueError):
            continue
        if m not in months:
            continue
        eid = str(sr.get("employee_id") or "")
        if eid in employee_ids:
            out[(eid, m)] = _normalize_stored_data(sr.get("stored_data"))
    return out


def _holidays_for_month(
    all_holidays: Set[str],
    month_start: date,
    month_end: date,
) -> Set[str]:
    return {
        dk
        for dk in all_holidays
        if month_start.isoformat() <= dk <= month_end.isoformat()
    }


def compute_absent_leave_used_by_months(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    months: List[int],
    year: int,
    *,
    today: Optional[date] = None,
) -> Tuple[Dict[int, Dict[str, int]], Dict[int, Dict[str, Optional[str]]]]:
    """
    Batched absent counts for multiple months (one attendance + snapshot fetch).

    Returns ({month: {employee_id: count}}, {month: {employee_id: period_end_iso}}).
    """
    d = today or date.today()
    month_set = {m for m in months if 1 <= m <= 12}
    counts_by_month: Dict[int, Dict[str, int]] = {m: {eid: 0 for eid in employee_ids} for m in month_set}
    period_by_month: Dict[int, Dict[str, Optional[str]]] = {
        m: {eid: None for eid in employee_ids} for m in month_set
    }
    if not employee_ids or not month_set:
        return counts_by_month, period_by_month

    sorted_months = sorted(month_set)
    range_start = date(year, sorted_months[0], 1)
    range_end = min(
        date(year, sorted_months[-1], calendar.monthrange(year, sorted_months[-1])[1]),
        d,
    )
    if range_start > d:
        return counts_by_month, period_by_month

    all_holidays = _holiday_dates_in_range(supabase, range_start, range_end)
    att_rows = _fetch_attendance_month_slice(supabase, range_start, range_end)
    rows_by_eid: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in att_rows or []:
        eid = str(row.get("employee_id") or "")
        if eid in employee_ids:
            rows_by_eid[eid].append(row)

    snap_by_eid_month = _load_monthly_snapshots_by_employee_months(
        supabase,
        employee_ids,
        month_set,
        year,
    )

    for m in sorted_months:
        month_start = date(year, m, 1)
        month_end = date(year, m, calendar.monthrange(year, m)[1])
        if month_start > d:
            continue
        query_end = min(month_end, d)
        holidays = _holidays_for_month(all_holidays, month_start, month_end)

        for eid in employee_ids:
            table_rows = [
                r
                for r in rows_by_eid.get(eid) or []
                if (dd := _parse_row_date(r)) is not None and month_start <= dd <= query_end
            ]
            snap_items = snap_by_eid_month.get((eid, m), [])
            merged = _merge_leave_day_rows(table_rows, snap_items)
            table_dates = {
                dd
                for r in table_rows
                if (dd := _parse_row_date(r)) is not None and month_start <= dd <= query_end
            }
            cap = _leave_period_cap(
                month_start,
                month_end,
                d,
                table_rows,
                list(merged.keys()),
            )
            cap = min(cap, query_end)
            counts_by_month[m][eid] = _count_absent_from_merged_days(
                merged,
                table_dates,
                month_start,
                cap,
                holidays,
            )
            period_by_month[m][eid] = cap.isoformat() if cap >= month_start else None

    return counts_by_month, period_by_month


def compute_absent_leave_used_by_employee(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    month: int,
    year: int,
    *,
    today: Optional[date] = None,
) -> Tuple[Dict[str, int], Dict[str, Optional[str]]]:
    """
    Per-employee absent day counts for leave Total Used (selected month only).
    """
    counts_by_month, period_by_month = compute_absent_leave_used_by_months(
        supabase,
        employee_ids,
        [month],
        year,
        today=today,
    )
    counts = counts_by_month.get(month, {eid: 0 for eid in employee_ids})
    period_end = period_by_month.get(month, {eid: None for eid in employee_ids})
    return counts, period_end


def compute_ytd_absent_leave_used_before_month(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    month: int,
    year: int,
    *,
    today: Optional[date] = None,
) -> Dict[str, int]:
    """Sum absent days for months 1 .. month-1 (batched, same rules as monthly Total Used)."""
    ytd: Dict[str, int] = {eid: 0 for eid in employee_ids}
    if month <= 1 or not employee_ids or not (1 <= month <= 12):
        return ytd

    prior_months = list(range(1, month))
    counts_by_month, _ = compute_absent_leave_used_by_months(
        supabase,
        employee_ids,
        prior_months,
        year,
        today=today,
    )
    for m in prior_months:
        month_counts = counts_by_month.get(m, {})
        for eid in employee_ids:
            ytd[eid] += int(month_counts.get(eid, 0))
    return ytd


def calculate_user_leave_balance(
    employee_id: str,
    month: int,
    year: int,
    total_leave: float,
    supabase: SupabaseRest,
    *,
    today: Optional[date] = None,
) -> Dict[str, Any]:
    counts, period = compute_absent_leave_used_by_employee(
        supabase,
        {employee_id},
        month,
        year,
        today=today,
    )
    used = float(counts.get(employee_id, 0))
    ytd_before = float(
        compute_ytd_absent_leave_used_before_month(
            supabase,
            {employee_id},
            month,
            year,
            today=today,
        ).get(employee_id, 0)
    )
    alloc = max(0.0, float(total_leave))
    used_ytd_after = ytd_before + used
    remaining_at_month_start = max(0.0, round(alloc - ytd_before, 2))

    balance_leave = max(0.0, round(alloc - used_ytd_after, 2))
    lop_days = max(0.0, round(used - remaining_at_month_start, 2))
    leave_exhausted = balance_leave == 0 and alloc > 0 and used > 0

    return {
        "employee_id": employee_id,
        "month": month,
        "year": year,
        "total_leave": alloc,
        "total_used": used,
        "ytd_used_leave": round(used_ytd_after, 2),
        "balance_leave": balance_leave,
        "lop_days": lop_days,
        "leave_exhausted": leave_exhausted,
        "attendance_period_end": period.get(employee_id),
    }

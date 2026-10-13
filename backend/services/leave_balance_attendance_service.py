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
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Any, Dict, List, Optional, Set, Tuple

from database.supabase_client import SupabaseRest
from services.attendance_management_service import late_arrival_cl_deduction
from services.monthly_snapshot_cache import load_year_snapshots


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


def _is_absent_status(row: Dict[str, Any]) -> bool:
    # Leave “Total Used” must match Attendance grid “Atten.” column.
    # Attendance grid marks Absent when `status === "A"`; stored snapshots may also
    # carry the rendered Atten. value in `absent`.
    return (
        str(row.get("status") or "").strip().upper() == "A"
        or str(row.get("absent") or "").strip().upper() == "A"
    )


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
            select="employee_id,date,status,check_in",
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
    Cap leave counting at the latest Attendance grid date available, never beyond today.

    `public.attendance` rows can lag behind `monthly_attendance.stored_data`; the Leave
    page must still match the visible Attendance grid's Atten. column for all users.
    """
    dlim = min(month_end, today)
    available_dates: List[date] = []
    for row in table_rows or []:
        dd = _parse_row_date(row)
        if dd is not None and month_start <= dd <= month_end:
            available_dates.append(dd)
    if known_dates:
        available_dates.extend(day for day in known_dates if month_start <= day <= month_end)
    if available_dates:
        return min(dlim, max(available_dates))
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


def _is_present_status(row: Dict[str, Any]) -> bool:
    """Present = Attendance grid Atten. column `P` (not leave-absent)."""
    if _is_absent_status(row):
        return False
    return str(row.get("status") or "").strip().upper() == "P"


def _is_countable_leave_present(
    row: Dict[str, Any],
    day: date,
    holidays: Set[str],
) -> bool:
    if day.weekday() == 6 or day.isoformat() in holidays:
        return False
    return _is_present_status(row)


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


def _count_present_from_merged_days(
    merged: Dict[date, Dict[str, Any]],
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
        if not _is_countable_leave_present(row, day, holidays):
            continue
        if day in seen:
            continue
        seen.add(day)
        n += 1
    return n


def _sum_late_cl_from_merged_days(
    merged: Dict[date, Dict[str, Any]],
    month_start: date,
    period_end: date,
    holidays: Set[str],
) -> float:
    """CL+SL days deducted for late arrivals (Half Day 0.5 / Full Day CL 1.0) on present days."""
    total = 0.0
    for day, row in merged.items():
        if day < month_start or day > period_end:
            continue
        if not _is_countable_leave_present(row, day, holidays):
            continue
        # DB row wins (check_in, may be None); snapshot carries in_time.
        in_time = row["check_in"] if "check_in" in row else row.get("in_time")
        total += late_arrival_cl_deduction(day, in_time)
    return total


def _load_monthly_snapshots_by_employee_months(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    months: Set[int],
    year: int,
) -> Dict[Tuple[str, int], List[Dict[str, Any]]]:
    out: Dict[Tuple[str, int], List[Dict[str, Any]]] = {}
    if not months:
        return out
    for sr in load_year_snapshots(supabase, year):
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


# First upload date per employee never moves once it exists; remember it for 10 minutes.
_FIRST_ATTENDANCE_TTL_SECONDS = 600.0
_first_attendance_cache: Dict[str, Tuple[float, date]] = {}


def first_attendance_date_by_employee(
    supabase: SupabaseRest,
    employee_ids: Set[str],
) -> Dict[str, date]:
    """Earliest ``public.attendance`` date per employee (the first uploaded entry)."""
    now = time.monotonic()
    out: Dict[str, date] = {}
    missing: List[str] = []
    for eid in employee_ids:
        hit = _first_attendance_cache.get(eid)
        if hit and hit[0] > now:
            out[eid] = hit[1]
        else:
            missing.append(eid)
    if not missing:
        return out

    # ponytail: one tiny query per employee (PostgREST has no GROUP BY min without an RPC),
    # run together so the cost is one round trip, not one per employee.
    def _first_date(eid: str) -> Tuple[str, Optional[date]]:
        try:
            rows = supabase.select(
                table="attendance",
                select="date",
                where_eq={"employee_id": eid},
                order="date.asc",
                limit=1,
            )
        except Exception:
            return eid, None
        return eid, (_parse_row_date(rows[0]) if rows else None)

    with ThreadPoolExecutor(max_workers=min(8, len(missing))) as pool:
        for eid, dd in pool.map(_first_date, missing):
            if dd is not None:
                out[eid] = dd
                _first_attendance_cache[eid] = (now + _FIRST_ATTENDANCE_TTL_SECONDS, dd)
    return out


def compute_leave_attendance_days_by_months(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    months: List[int],
    year: int,
    *,
    today: Optional[date] = None,
    period_start_by_eid: Optional[Dict[str, date]] = None,
    period_end_by_eid: Optional[Dict[str, date]] = None,
) -> Tuple[
    Dict[int, Dict[str, int]],
    Dict[int, Dict[str, int]],
    Dict[int, Dict[str, Optional[str]]],
    Dict[int, Dict[str, float]],
]:
    """
    Batched present + absent counts for multiple months (one attendance + snapshot fetch).

    Present and absent both follow Attendance grid Atten. (`status` / `absent` columns),
    with the same period cap — matches Leave page Total Used per user.
    ``period_start_by_eid`` (joining date / first attendance upload) drops days before it, and
    ``period_end_by_eid`` (left date) drops days after it from the counts.

    Returns (
        {month: {employee_id: absent_count}},
        {month: {employee_id: present_count}},
        {month: {employee_id: period_end_iso}},
        {month: {employee_id: late_cl_days}},   # Half Day 0.5 / Full Day CL 1.0, from Oct 2026
    ).
    """
    d = today or date.today()
    month_set = {m for m in months if 1 <= m <= 12}
    absent_by_month: Dict[int, Dict[str, int]] = {m: {eid: 0 for eid in employee_ids} for m in month_set}
    present_by_month: Dict[int, Dict[str, int]] = {m: {eid: 0 for eid in employee_ids} for m in month_set}
    period_by_month: Dict[int, Dict[str, Optional[str]]] = {
        m: {eid: None for eid in employee_ids} for m in month_set
    }
    late_cl_by_month: Dict[int, Dict[str, float]] = {m: {eid: 0.0 for eid in employee_ids} for m in month_set}
    if not employee_ids or not month_set:
        return absent_by_month, present_by_month, period_by_month, late_cl_by_month

    sorted_months = sorted(month_set)
    range_start = date(year, sorted_months[0], 1)
    range_end = min(
        date(year, sorted_months[-1], calendar.monthrange(year, sorted_months[-1])[1]),
        d,
    )
    if range_start > d:
        return absent_by_month, present_by_month, period_by_month, late_cl_by_month

    # Holidays, attendance rows and snapshots are independent → one round trip.
    with ThreadPoolExecutor(max_workers=3) as pool:
        fut_holidays = pool.submit(_holiday_dates_in_range, supabase, range_start, range_end)
        fut_rows = pool.submit(_fetch_attendance_month_slice, supabase, range_start, range_end)
        fut_snaps = pool.submit(
            _load_monthly_snapshots_by_employee_months, supabase, employee_ids, month_set, year
        )
        all_holidays = fut_holidays.result()
        att_rows = fut_rows.result()
        snap_by_eid_month = fut_snaps.result()
    rows_by_eid: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in att_rows or []:
        eid = str(row.get("employee_id") or "")
        if eid in employee_ids:
            rows_by_eid[eid].append(row)

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
            cap = min(cap, query_end, (period_end_by_eid or {}).get(eid) or cap)
            start = max(month_start, (period_start_by_eid or {}).get(eid) or month_start)
            absent_by_month[m][eid] = _count_absent_from_merged_days(
                merged,
                table_dates,
                start,
                cap,
                holidays,
            )
            present_by_month[m][eid] = _count_present_from_merged_days(
                merged,
                start,
                cap,
                holidays,
            )
            late_cl_by_month[m][eid] = _sum_late_cl_from_merged_days(merged, start, cap, holidays)
            period_by_month[m][eid] = cap.isoformat() if cap >= month_start else None

    return absent_by_month, present_by_month, period_by_month, late_cl_by_month


def compute_absent_leave_used_by_months(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    months: List[int],
    year: int,
    *,
    today: Optional[date] = None,
) -> Tuple[Dict[int, Dict[str, float]], Dict[int, Dict[str, Optional[str]]]]:
    """
    Batched leave-used days for multiple months (one attendance + snapshot fetch).

    Leave used = Absent days + late-arrival CL deductions (Half Day 0.5 / Full Day CL 1.0).

    Returns ({month: {employee_id: used_days}}, {month: {employee_id: period_end_iso}}).
    """
    absent_by_month, _, period_by_month, late_cl_by_month = compute_leave_attendance_days_by_months(
        supabase,
        employee_ids,
        months,
        year,
        today=today,
    )
    used_by_month = {
        m: {eid: float(absent) + float(late_cl_by_month[m].get(eid, 0)) for eid, absent in counts.items()}
        for m, counts in absent_by_month.items()
    }
    return used_by_month, period_by_month


def compute_absent_leave_used_by_employee(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    month: int,
    year: int,
    *,
    today: Optional[date] = None,
) -> Tuple[Dict[str, float], Dict[str, Optional[str]]]:
    """
    Per-employee leave-used days (absent + late CL) for leave Total Used (selected month only).
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
) -> Dict[str, float]:
    """Sum leave-used days for months 1 .. month-1 (batched, same rules as monthly Total Used)."""
    ytd: Dict[str, float] = {eid: 0.0 for eid in employee_ids}
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
            ytd[eid] += float(month_counts.get(eid, 0))
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
    from services.leave_service import (
        LEAVE_BALANCE_ROLLING_START_MONTH,
        leave_month_balance_snapshot,
    )

    counts_by_month, period_by_month = compute_absent_leave_used_by_months(
        supabase,
        {employee_id},
        list(range(1, month + 1)),
        year,
        today=today,
    )
    used = float(counts_by_month.get(month, {}).get(employee_id, 0))
    prior_from_may = sum(
        float(counts_by_month.get(m, {}).get(employee_id, 0))
        for m in range(LEAVE_BALANCE_ROLLING_START_MONTH, month)
        if m >= LEAVE_BALANCE_ROLLING_START_MONTH
    )
    snap = leave_month_balance_snapshot(
        total_leave=total_leave,
        month_absent_days=used,
        month=month,
        prior_used_from_may=prior_from_may,
    )
    period = period_by_month.get(month, {})

    return {
        "employee_id": employee_id,
        "month": month,
        "year": year,
        "total_leave": float(snap["total_leave"]),
        "total_used": used,
        "ytd_used_leave": float(snap["ytd_used_leave"]),
        "balance_leave": float(snap["balance_leave"]),
        "lop_days": float(snap["lop_days"]),
        "leave_exhausted": bool(snap["leave_exhausted"]),
        "attendance_period_end": period.get(employee_id),
    }

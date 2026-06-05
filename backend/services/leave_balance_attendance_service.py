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
from collections import defaultdict
from datetime import date, timedelta
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


def _is_absent_status(row: Dict[str, Any]) -> bool:
    return str(row.get("status") or "").strip().upper() == "A"


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
            select="employee_id,date,status",
            where_gte={"date": month_start.isoformat()},
            where_lte={"date": query_end.isoformat()},
            limit=500_000,
        )
    except Exception:
        return []


def _count_absent_from_day_rows(
    day_rows: List[Dict[str, Any]],
    month_start: date,
    query_end: date,
    holidays: Set[str],
) -> Tuple[int, Optional[date]]:
    """Snapshot / UI rows: status A, skip Sunday & holidays, cap at latest day with data."""
    max_d: Optional[date] = None
    for item in day_rows:
        dd = _parse_row_date(item)
        if dd and month_start <= dd <= query_end:
            if max_d is None or dd > max_d:
                max_d = dd
    if max_d is None:
        return 0, None
    effective_end = min(max_d, query_end)
    seen: Set[date] = set()
    n = 0
    for item in day_rows:
        dd = _parse_row_date(item)
        if not dd or dd < month_start or dd > effective_end:
            continue
        if not _is_absent_status(item):
            continue
        if dd.weekday() == 6:
            continue
        if dd.isoformat() in holidays:
            continue
        if dd in seen:
            continue
        seen.add(dd)
        n += 1
    return n, effective_end


def _count_absent_from_attendance_db_rows(
    erows: List[Dict[str, Any]],
    month_start: date,
    query_end: date,
    month_end: date,
    holidays: Set[str],
) -> Tuple[int, Optional[date]]:
    dates_with_row: List[date] = []
    for r in erows:
        dd = _parse_row_date(r)
        if dd and month_start <= dd <= query_end:
            dates_with_row.append(dd)
    if not dates_with_row:
        return 0, None
    user_max = max(dates_with_row)
    effective_end = min(user_max, query_end, month_end)
    seen_days: Set[date] = set()
    absent_n = 0
    for r in erows:
        dd = _parse_row_date(r)
        if not dd or dd < month_start or dd > effective_end:
            continue
        if not _is_absent_status(r):
            continue
        if dd.weekday() == 6:
            continue
        if dd.isoformat() in holidays:
            continue
        if dd in seen_days:
            continue
        seen_days.add(dd)
        absent_n += 1
    return absent_n, effective_end


def _load_monthly_snapshots_by_employee(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    month: int,
    year: int,
) -> Dict[str, List[Dict[str, Any]]]:
    out: Dict[str, List[Dict[str, Any]]] = {}
    try:
        snap_rows = supabase.select(
            table="monthly_attendance",
            select="employee_id,stored_data",
            where_eq={"month": month, "year": year},
            limit=5000,
        )
    except Exception:
        return out
    for sr in snap_rows or []:
        eid = str(sr.get("employee_id") or "")
        if eid in employee_ids:
            out[eid] = _normalize_stored_data(sr.get("stored_data"))
    return out


def compute_absent_leave_used_by_employee(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    month: int,
    year: int,
    *,
    today: Optional[date] = None,
) -> Tuple[Dict[str, int], Dict[str, Optional[str]]]:
    """
    Per-employee absent day counts for leave Total Used (user-wise).
    Uses max(snapshot, attendance table) when a monthly snapshot exists so values match Attendance UI.
    """
    d = today or date.today()
    counts: Dict[str, int] = {eid: 0 for eid in employee_ids}
    period_end: Dict[str, Optional[str]] = {eid: None for eid in employee_ids}
    if not employee_ids or not (1 <= month <= 12):
        return counts, period_end

    month_start = date(year, month, 1)
    month_end = date(year, month, calendar.monthrange(year, month)[1])
    if month_start > d:
        return counts, period_end

    query_end = min(month_end, d)
    holidays = _holiday_dates_in_range(supabase, month_start, query_end)
    att_rows = _fetch_attendance_month_slice(supabase, month_start, query_end)

    rows_by_eid: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in att_rows or []:
        eid = str(row.get("employee_id") or "")
        if eid in employee_ids:
            rows_by_eid[eid].append(row)

    snap_by_eid = _load_monthly_snapshots_by_employee(supabase, employee_ids, month, year)

    for eid in employee_ids:
        att_c, att_end = _count_absent_from_attendance_db_rows(
            rows_by_eid.get(eid) or [],
            month_start,
            query_end,
            month_end,
            holidays,
        )
        if eid in snap_by_eid:
            snap_c, snap_end = _count_absent_from_day_rows(
                snap_by_eid[eid],
                month_start,
                query_end,
                holidays,
            )
            counts[eid] = max(int(snap_c), int(att_c))
            ends = [x for x in (att_end, snap_end) if x is not None]
            period_end[eid] = max(ends).isoformat() if ends else None
        else:
            counts[eid] = att_c
            period_end[eid] = att_end.isoformat() if att_end else None

    return counts, period_end


def compute_ytd_absent_leave_used_before_month(
    supabase: SupabaseRest,
    employee_ids: Set[str],
    month: int,
    year: int,
    *,
    today: Optional[date] = None,
) -> Dict[str, int]:
    """
    Sum absent days for months 1 .. month-1 in one year (batched DB reads).
    Used by payroll leave-balance / LOP salary adjustment.
    """
    d = today or date.today()
    ytd: Dict[str, int] = {eid: 0 for eid in employee_ids}
    if month <= 1 or not employee_ids or not (1 <= month <= 12):
        return ytd

    year_start = date(year, 1, 1)
    prev_month_last = date(year, month, 1) - timedelta(days=1)
    range_end = min(prev_month_last, d)
    if range_end < year_start:
        return ytd

    holidays = _holiday_dates_in_range(supabase, year_start, range_end)
    att_rows = _fetch_attendance_month_slice(supabase, year_start, range_end)

    rows_by_eid: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in att_rows or []:
        eid = str(row.get("employee_id") or "")
        if eid in employee_ids:
            rows_by_eid[eid].append(row)

    snap_by_eid_month: Dict[Tuple[str, int], List[Dict[str, Any]]] = {}
    try:
        snap_rows = supabase.select(
            table="monthly_attendance",
            select="employee_id,month,stored_data",
            where_eq={"year": year},
            limit=5000,
        )
        for sr in snap_rows or []:
            try:
                m = int(sr.get("month") or 0)
            except (TypeError, ValueError):
                continue
            if m < 1 or m >= month:
                continue
            eid = str(sr.get("employee_id") or "")
            if eid in employee_ids:
                snap_by_eid_month[(eid, m)] = _normalize_stored_data(sr.get("stored_data"))
    except Exception:
        pass

    for eid in employee_ids:
        erows = rows_by_eid.get(eid) or []
        total = 0
        for m in range(1, month):
            month_start = date(year, m, 1)
            month_end = date(year, m, calendar.monthrange(year, m)[1])
            if month_start > d:
                break
            query_end = min(month_end, d)
            month_erows = [
                r
                for r in erows
                if (dd := _parse_row_date(r)) is not None and month_start <= dd <= query_end
            ]
            att_c, _ = _count_absent_from_attendance_db_rows(
                month_erows,
                month_start,
                query_end,
                month_end,
                holidays,
            )
            snap = snap_by_eid_month.get((eid, m))
            if snap:
                snap_c, _ = _count_absent_from_day_rows(snap, month_start, query_end, holidays)
                total += max(int(snap_c), int(att_c))
            else:
                total += int(att_c)
        ytd[eid] = total

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
    raw_balance = float(total_leave) - used
    balance_leave = max(0.0, round(raw_balance, 2))
    lop_days = max(0.0, round(used - float(total_leave), 2))
    leave_exhausted = balance_leave == 0 and float(total_leave) > 0 and used > 0

    return {
        "employee_id": employee_id,
        "month": month,
        "year": year,
        "total_leave": float(total_leave),
        "total_used": used,
        "balance_leave": balance_leave,
        "lop_days": lop_days,
        "leave_exhausted": leave_exhausted,
        "attendance_period_end": period.get(employee_id),
    }

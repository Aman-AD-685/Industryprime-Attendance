"""Shared employee list for payroll, leave, and HR screens (narrow columns, capped)."""

from __future__ import annotations

import threading
import time
from typing import Any, Dict, List, Optional

from database.supabase_client import SupabaseRest

EMPLOYEE_HR_SELECT = (
    "id,employee_code,at_div_code,name,email,department,designation,"
    "salary_monthly,professional_tax,pf_employee_monthly,income_tax_tds_monthly,"
    "hra_monthly,conveyance_monthly,special_allowance_monthly,"
    "employment_status,left_effective_month,left_effective_year,joining_date,left_date"
)

# Use `*` because deployed schemas may differ slightly across environments
# (some have legacy columns, some don't). Callers only read a small shared subset.
LEAVE_REQUEST_SUMMARY_SELECT = "*"

# Only columns that exist in public.leave_balances — a missing column makes the whole select
# fail and silently falls back to the per-email defaults everywhere.
LEAVE_BALANCE_SELECT = "employee_id,year,total_leave"


# Columns added by database/employees_joining_left_date.sql; selected only when they exist.
_DATE_COLUMNS = ",joining_date,left_date"
# When the migration has not been run, skip the failing select for a minute at a time.
_date_columns_missing_until = 0.0

# The roster is tiny and read by almost every endpoint; keep it for a minute. Writers call
# invalidate_employees_cache() so edits show up immediately (single backend instance).
_EMPLOYEES_TTL_SECONDS = 60.0
_employees_cache: Optional[tuple[float, List[Dict[str, Any]]]] = None
_employees_lock = threading.Lock()


def invalidate_employees_cache() -> None:
    global _employees_cache
    with _employees_lock:
        _employees_cache = None


def select_all_employees(supabase: SupabaseRest) -> List[Dict[str, Any]]:
    """All employees (name order), cached briefly; see invalidate_employees_cache()."""
    global _employees_cache
    now = time.monotonic()
    with _employees_lock:
        hit = _employees_cache
    if hit and hit[0] > now:
        return [dict(r) for r in hit[1]]
    rows = _fetch_all_employees(supabase)
    with _employees_lock:
        _employees_cache = (now + _EMPLOYEES_TTL_SECONDS, rows)
    return [dict(r) for r in rows]


def _fetch_all_employees(supabase: SupabaseRest) -> List[Dict[str, Any]]:
    """Falls back to the pre-migration column list so the app keeps working until
    employees_joining_left_date.sql has been run."""
    global _date_columns_missing_until
    if _date_columns_missing_until <= time.monotonic():
        try:
            return supabase.select(table="employees", select=EMPLOYEE_HR_SELECT, order="name.asc", limit=5000) or []
        except RuntimeError as exc:
            if "joining_date" not in str(exc) and "left_date" not in str(exc):
                raise
            _date_columns_missing_until = time.monotonic() + 60.0
    return (
        supabase.select(
            table="employees",
            select=EMPLOYEE_HR_SELECT.replace(_DATE_COLUMNS, ""),
            order="name.asc",
            limit=5000,
        )
        or []
    )


def list_hr_employees(
    supabase: SupabaseRest,
    *,
    user_email: Optional[str] = None,
    admin: bool = True,
) -> List[Dict[str, Any]]:
    rows = select_all_employees(supabase)
    if admin or not user_email:
        return rows or []
    clean = user_email.strip().lower()
    return [row for row in rows or [] if str(row.get("email") or "").strip().lower() == clean]


def fetch_leave_balances_for_year(supabase: SupabaseRest, year: int) -> List[Dict[str, Any]]:
    try:
        return supabase.select(
            table="leave_balances",
            select=LEAVE_BALANCE_SELECT,
            where_eq={"year": year},
            limit=5000,
        )
    except Exception:
        return []


def fetch_leave_requests_summary(supabase: SupabaseRest, *, limit: int = 1500) -> List[Dict[str, Any]]:
    try:
        return supabase.select(
            table="leave_requests",
            select=LEAVE_REQUEST_SUMMARY_SELECT,
            where_eq=None,
            order="created_at.desc",
            limit=limit,
        )
    except Exception:
        return []

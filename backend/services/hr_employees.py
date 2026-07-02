"""Shared employee list for payroll, leave, and HR screens (narrow columns, capped)."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from database.supabase_client import SupabaseRest

EMPLOYEE_HR_SELECT = (
    "id,employee_code,at_div_code,name,email,department,designation,"
    "salary_monthly,professional_tax,pf_employee_monthly,income_tax_tds_monthly,"
    "hra_monthly,conveyance_monthly,special_allowance_monthly"
)

LEAVE_REQUEST_SUMMARY_SELECT = (
    "id,employee_id,employee_code,employee_name,leave_type,type,status,"
    "leave_date_start,leave_date_end,start_date,end_date,days,reason,created_at"
)

LEAVE_BALANCE_SELECT = "employee_id,year,total_leave,allocated_leave,balance_leave"


def list_hr_employees(
    supabase: SupabaseRest,
    *,
    user_email: Optional[str] = None,
    admin: bool = True,
) -> List[Dict[str, Any]]:
    rows = supabase.select(
        table="employees",
        select=EMPLOYEE_HR_SELECT,
        where_eq=None,
        order="name.asc",
        limit=5000,
    )
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

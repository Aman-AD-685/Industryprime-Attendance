from __future__ import annotations

from datetime import date
from typing import Any, Dict

from database.supabase_client import SupabaseRest, get_supabase


def get_dashboard_summary(
    for_date: date | None = None,
    tenant_id: str | None = None,
    supabase: SupabaseRest | None = None,
) -> Dict[str, Any]:
    """
    Premium KPI baseline for Phase 2.
    """
    if supabase is None:
        supabase = get_supabase()
    d = for_date or date.today()
    _ = tenant_id  # Phase 2 tables are not tenant-scoped in SQL; param kept for API compatibility.

    employees_data = supabase.select(
        table="employees",
        select="id",
        where_eq=None,
        limit=None,
    )
    total_employees = len(employees_data)

    try:
        attendance_data = supabase.select(
            table="attendance",
            select="employee_id,late_minutes",
            where_eq={"date": str(d)},
            limit=None,
        )
    except RuntimeError:
        attendance_data = []

    present_emp_codes = {r.get("employee_id") for r in attendance_data}
    present_today = len(present_emp_codes)
    late = sum(1 for r in attendance_data if (r.get("late_minutes") or 0) > 0)
    absent = max(0, total_employees - present_today)

    return {
        "total_employees": total_employees,
        "present_today": present_today,
        "absent": absent,
        "late": late,
        "as_of": str(d),
    }


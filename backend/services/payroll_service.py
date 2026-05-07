from __future__ import annotations

import calendar
from datetime import date
from typing import Any, Dict, List

from database.supabase_client import SupabaseRest, get_supabase
from services.working_hours import hhmm_value_to_minutes, minutes_to_hhmm_float


def generate_payroll(
    period_start: date,
    period_end: date,
    tenant_id: str | None = None,
    supabase: SupabaseRest | None = None,
) -> Dict[str, Any]:
    """
    Legacy payroll run writer. Kept for older clients, but the UI now uses
    summarize_payroll() because the Phase 2 schema does not require payroll tables.
    """
    if supabase is None:
        supabase = get_supabase()

    try:
        run_insert: Dict[str, Any] = {
            "period_start": str(period_start),
            "period_end": str(period_end),
            "status": "pending",
        }
        if tenant_id:
            run_insert["tenant_id"] = tenant_id

        run_rows = supabase.insert_many(
            table="payroll_runs",
            rows=[run_insert],
            return_representation=True,
        )
        run_data = run_rows[0] if run_rows else {}
        return {"payroll_run": run_data, "items": []}
    except Exception as e:
        return {
            "payroll_run": {},
            "items": [],
            "warning": (
                "Payroll storage skipped (Phase 2 schema has no payroll_runs/payroll_items "
                f"or legacy columns missing). {e}"
            ),
        }


def _month_bounds(month: int, year: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _leave_days(row: Dict[str, Any]) -> float:
    if row.get("days") is not None:
        return float(row.get("days") or 0)
    start_raw = row.get("leave_date_start") or row.get("start_date")
    end_raw = row.get("leave_date_end") or row.get("end_date") or start_raw
    if not start_raw:
        return 0
    start = date.fromisoformat(str(start_raw)[:10])
    end = date.fromisoformat(str(end_raw)[:10])
    return float(max(0, (end - start).days + 1))


def _is_admin(role: str) -> bool:
    return role in {"master_admin", "admin"}


def summarize_payroll(
    month: int,
    year: int,
    user_email: str,
    role: str,
    supabase: SupabaseRest,
) -> Dict[str, Any]:
    start, end = _month_bounds(month, year)
    total_days = 30
    total_sundays = sum(
        1 for day in range(1, calendar.monthrange(year, month)[1] + 1)
        if date(year, month, day).weekday() == 6
    )

    employees = supabase.select(
        table="employees",
        select="*",
        where_eq=None,
        order="name.asc",
    )
    if not _is_admin(role):
        clean_email = user_email.strip().lower()
        employees = [row for row in employees if str(row.get("email") or "").strip().lower() == clean_email]

    employee_by_id = {str(row.get("id")): row for row in employees}
    employee_codes = {str(row.get("employee_code") or ""): row for row in employees}

    attendance_rows = supabase.select(
        table="attendance",
        select="*",
        where_gte={"date": start.isoformat()},
        where_lte={"date": end.isoformat()},
        order="date.asc",
    )

    attendance_by_employee: Dict[str, List[Dict[str, Any]]] = {emp_id: [] for emp_id in employee_by_id}
    for row in attendance_rows:
        emp_id = str(row.get("employee_id") or "")
        if emp_id in attendance_by_employee:
            attendance_by_employee[emp_id].append(row)

    try:
        leave_rows = supabase.select(
            table="leave_requests",
            select="*",
            where_gte={"leave_date_start": start.isoformat()},
            where_lte={"leave_date_start": end.isoformat()},
            order="leave_date_start.asc",
        )
    except Exception:
        leave_rows = []

    try:
        balance_rows = supabase.select(table="leave_balances", select="*", where_eq={"year": year})
    except Exception:
        balance_rows = []

    leave_by_employee: Dict[str, List[Dict[str, Any]]] = {emp_id: [] for emp_id in employee_by_id}
    for row in leave_rows:
        emp_id = str(row.get("employee_id") or "")
        if not emp_id and row.get("employee_code") is not None:
            emp = employee_codes.get(str(row.get("employee_code") or ""))
            emp_id = str(emp.get("id")) if emp else ""
        if emp_id in leave_by_employee:
            leave_by_employee[emp_id].append(row)

    balances_by_employee = {str(row.get("employee_id")): row for row in balance_rows}

    summaries: List[Dict[str, Any]] = []
    for emp_id, employee in employee_by_id.items():
        rows = attendance_by_employee.get(emp_id, [])
        present_rows = [row for row in rows if row.get("check_in") and row.get("check_out")]
        total_minutes = sum(hhmm_value_to_minutes(row.get("working_hours")) for row in rows)
        total_hours = minutes_to_hhmm_float(total_minutes)
        present = len({str(row.get("date"))[:10] for row in present_rows})
        holidays = 0
        absent = max(0, total_days - total_sundays - holidays - present)
        monthly_salary = float(employee.get("salary_monthly") or 0)
        salary_per_day = round(monthly_salary / total_days, 2) if total_days else 0
        deductions = round(absent * salary_per_day, 2)
        payable = round(monthly_salary - deductions, 2)

        emp_leave_rows = leave_by_employee.get(emp_id, [])
        used_leave = round(
            sum(_leave_days(row) for row in emp_leave_rows if str(row.get("status") or "").lower() == "approved"),
            2,
        )
        balance = balances_by_employee.get(emp_id) or {}
        total_leave = float(balance.get("total_leave") or 0)

        summaries.append(
            {
                "employee": {
                    "id": emp_id,
                    "employee_code": employee.get("employee_code"),
                    "name": employee.get("name"),
                    "email": employee.get("email"),
                    "department": employee.get("department"),
                    "designation": employee.get("designation"),
                    "salary_monthly": monthly_salary,
                },
                "month": month,
                "year": year,
                "total_days": total_days,
                "total_days_present": present,
                "total_days_absent": absent,
                "total_hours_in_office": total_hours,
                "total_sundays": total_sundays,
                "holidays": holidays,
                "salary_per_day": salary_per_day,
                "total_salary": monthly_salary,
                "deductions": deductions,
                "final_payable_amount": payable,
                "leave": {
                    "total_leave": total_leave,
                    "total_used_leave": used_leave,
                    "balance_leave": round(total_leave - used_leave, 2),
                    "requests": emp_leave_rows,
                },
                "attendance": rows,
            }
        )

    return {"month": month, "year": year, "items": summaries}

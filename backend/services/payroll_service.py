from __future__ import annotations

import calendar
from datetime import date
from typing import Any, Dict, List

from database.supabase_client import SupabaseRest, get_supabase
from services.leave_balance_attendance_service import compute_absent_leave_used_by_months
from services.leave_service import (
    LEAVE_BALANCE_ROLLING_START_MONTH,
    get_allocated_total_leave,
    leave_month_balance_snapshot,
)
from services.payroll_attendance_summary_service import compute_payroll_attendance_metrics
from services.payroll_constants import PAYROLL_SALARY_DAYS_PER_MONTH
from services.payslip_service import compute_payslip
from services.working_hours import minutes_to_hhmm_float


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


def _is_admin(role: str) -> bool:
    return role in {"master_admin", "admin"}


def summarize_payroll(
    month: int,
    year: int,
    user_email: str,
    role: str,
    supabase: SupabaseRest,
) -> Dict[str, Any]:
    # Salary per-day and payslip proration always use 30 days (not actual month length).
    salary_basis_days = PAYROLL_SALARY_DAYS_PER_MONTH
    actual_calendar_days_in_month = calendar.monthrange(year, month)[1]

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
    emp_id_set = set(employee_by_id.keys())

    metrics_by_eid, _ = compute_payroll_attendance_metrics(
        supabase,
        emp_id_set,
        month,
        year,
    )
    leave_counts_by_month, _ = compute_absent_leave_used_by_months(
        supabase,
        emp_id_set,
        list(range(1, month + 1)),
        year,
    )
    leave_total_used_days = leave_counts_by_month.get(month, {})
    try:
        balance_rows = supabase.select(table="leave_balances", select="*", where_eq={"year": year})
    except Exception:
        balance_rows = []

    balances_by_employee = {str(row.get("employee_id")): row for row in balance_rows}

    summaries: List[Dict[str, Any]] = []
    for emp_id, employee in employee_by_id.items():
        m = metrics_by_eid.get(emp_id, {})
        present = int(m.get("present_days") or 0)
        metrics_absent = int(m.get("absent_days") or 0)
        # Canonical absent = Leave "Total Used" (status A, matches attendance grid / leave page).
        absent = int(leave_total_used_days.get(emp_id, 0))
        weekoff_days = int(m.get("weekoff_days") or 0)
        holiday_days = int(m.get("holiday_days") or 0)
        base_salary_eligible = float(m.get("salary_eligible_days") or 0)
        total_minutes = int(m.get("total_working_minutes") or 0)
        total_hours = minutes_to_hhmm_float(total_minutes)

        balance_row = balances_by_employee.get(emp_id)
        total_leave = get_allocated_total_leave(employee, balance_row)
        leave_snap = leave_month_balance_snapshot(
            total_leave=total_leave,
            month_absent_days=float(absent),
            month=month,
            prior_used_from_may=float(
                sum(
                    int(leave_counts_by_month.get(m, {}).get(emp_id, 0))
                    for m in range(LEAVE_BALANCE_ROLLING_START_MONTH, month)
                    if m >= LEAVE_BALANCE_ROLLING_START_MONTH
                )
            ),
        )
        leave_covered_days = float(leave_snap["leave_covered_days"])
        lop_days = float(leave_snap["lop_days"])
        balance_leave = float(leave_snap["balance_leave"])
        month_used_leave = float(leave_snap["total_used_leave"])

        monthly_salary = float(employee.get("salary_monthly") or 0)
        divisor = float(salary_basis_days)
        salary_per_day = round(monthly_salary / divisor, 2) if divisor else 0

        payslip = compute_payslip(
            employee,
            month=month,
            year=year,
            calendar_days=salary_basis_days,
            present_days=present,
            absent_attendance_days=absent,
            weekoff_days=weekoff_days,
            holiday_days=holiday_days,
            salary_eligible_days=base_salary_eligible,
            monthly_salary=monthly_salary,
            leave_covered_days=leave_covered_days,
            lop_days=lop_days,
        )

        payable = float(payslip.get("net_pay") or 0)
        gross_earned = float((payslip.get("earnings") or {}).get("gross_earned") or 0)
        deductions = max(0.0, round(gross_earned - payable, 2))
        display_salary_days = float(payslip.get("paid_salary_days") or base_salary_eligible)

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
                    "professional_tax": employee.get("professional_tax"),
                    "pf_employee_monthly": employee.get("pf_employee_monthly"),
                    "income_tax_tds_monthly": employee.get("income_tax_tds_monthly"),
                    "hra_monthly": employee.get("hra_monthly"),
                    "conveyance_monthly": employee.get("conveyance_monthly"),
                    "special_allowance_monthly": employee.get("special_allowance_monthly"),
                },
                "month": month,
                "year": year,
                "total_days": salary_basis_days,
                "calendar_days_in_month_actual": actual_calendar_days_in_month,
                "salary_basis_days": salary_basis_days,
                "total_days_present": present,
                "total_days_absent": absent,
                "attendance_absent_days": metrics_absent,
                "weekoff_days": weekoff_days,
                "holiday_days": holiday_days,
                "salary_eligible_days": display_salary_days,
                "leave_covered_days": leave_covered_days,
                "lop_days": lop_days,
                "attendance_period_end": m.get("attendance_period_end"),
                "total_hours_in_office": total_hours,
                "total_sundays": weekoff_days,
                "holidays": holiday_days,
                "salary_per_day": salary_per_day,
                "total_salary": monthly_salary,
                "deductions": deductions,
                "final_payable_amount": payable,
                "leave": {
                    "total_leave": total_leave,
                    "total_used_leave": month_used_leave,
                    "month_used_leave": month_used_leave,
                    "balance_leave": balance_leave,
                    "leave_covered_days": leave_covered_days,
                    "lop_days": lop_days,
                    "leave_exhausted": bool(leave_snap["leave_exhausted"]),
                },
                "payslip": payslip,
            }
        )

    return {"month": month, "year": year, "items": summaries}

"""Payroll LOP must match the Leave page: leave counting is clipped by joining date only."""

from __future__ import annotations

from datetime import date
from unittest.mock import patch

from services import payroll_service


def test_payroll_leave_counting_ignores_first_attendance_fallback() -> None:
    emp = {"id": "e1", "employee_code": "EMP1", "name": "A", "email": "a@x.com", "salary_monthly": 30000}
    seen: dict = {}

    def fake_leave_days(*_a, **kw):
        seen.update(kw)
        return {10: {"e1": 0}}, {10: {"e1": 0}}, {10: {"e1": None}}, {10: {"e1": 0.0}}

    with (
        patch.object(payroll_service, "list_hr_employees", return_value=[emp]),
        patch.object(payroll_service, "first_attendance_date_by_employee", return_value={"e1": date(2026, 5, 6)}),
        patch.object(payroll_service, "compute_payroll_attendance_metrics", return_value=({}, {})),
        patch.object(payroll_service, "compute_leave_attendance_days_by_months", side_effect=fake_leave_days),
        patch.object(payroll_service, "fetch_leave_balances_for_year", return_value=[]),
        patch.object(payroll_service, "resolve_salaries_for_month", return_value={}),
    ):
        payroll_service.summarize_payroll(10, 2026, "a@x.com", "master_admin", object())

    # First-attendance-row fallback is for salary proration only; it must not drop earlier
    # snapshot absents from Leave used / LOP (that is how payroll LOP diverged from Leave).
    assert seen["period_start_by_eid"] == {}

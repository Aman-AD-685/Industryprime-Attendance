"""Unit tests for payslip calculations (no I/O)."""

from __future__ import annotations

from datetime import date

from services.payslip_service import compute_payslip


def test_full_month_salary_plus_mobile_minus_pt() -> None:
    """21,000 + 299 mobile − 130 PT = 21,169 net (no LOP)."""
    employee = {
        "hra_monthly": None,
        "conveyance_monthly": None,
        "special_allowance_monthly": 299.0,
        "pf_employee_monthly": None,
        "income_tax_tds_monthly": None,
        "professional_tax": 130.0,
    }
    ps = compute_payslip(
        employee,
        month=5,
        year=2026,
        calendar_days=30,
        present_days=23,
        absent_attendance_days=0,
        weekoff_days=5,
        holiday_days=0,
        salary_eligible_days=28,
        monthly_salary=21_000.0,
        lop_days=0,
    )
    assert ps["earnings"]["salary"] == 21_000.0
    assert ps["earnings"]["special_allowance"] == 299.0
    assert ps["earnings"]["gross_earned"] == 21_299.0
    assert ps["deductions"]["professional_tax"] == 130.0
    assert ps["deductions"]["lop_deduction"] is None
    assert ps["net_pay"] == 21_169.0


def test_lop_is_explicit_deduction_not_prorated_salary() -> None:
    """1 LOP day → 700 deduction; earnings still show full monthly salary."""
    employee = {
        "hra_monthly": None,
        "conveyance_monthly": None,
        "special_allowance_monthly": 299.0,
        "pf_employee_monthly": None,
        "income_tax_tds_monthly": None,
        "professional_tax": 130.0,
    }
    ps = compute_payslip(
        employee,
        month=5,
        year=2026,
        calendar_days=30,
        present_days=23,
        absent_attendance_days=1,
        weekoff_days=5,
        holiday_days=0,
        salary_eligible_days=28,
        monthly_salary=21_000.0,
        lop_days=1,
    )
    assert ps["earnings"]["salary"] == 21_000.0
    assert ps["earnings"]["gross_earned"] == 21_299.0
    assert ps["deductions"]["lop_deduction"] == 700.0
    assert ps["net_pay"] == 20_469.0


def test_professional_tax_full_month_not_prorated() -> None:
    employee = {
        "hra_monthly": None,
        "conveyance_monthly": None,
        "special_allowance_monthly": None,
        "pf_employee_monthly": None,
        "income_tax_tds_monthly": None,
        "professional_tax": 200.0,
    }
    ps = compute_payslip(
        employee,
        month=5,
        year=2026,
        calendar_days=30,
        present_days=10,
        absent_attendance_days=5,
        weekoff_days=10,
        holiday_days=5,
        salary_eligible_days=25,
        monthly_salary=30_000.0,
        lop_days=5,
    )
    assert ps["deductions"]["professional_tax"] == 200.0
    assert ps["earnings"]["salary"] == 30_000.0
    assert ps["earnings"]["gross_earned"] == 30_000.0
    assert ps["deductions"]["lop_deduction"] == 5_000.0
    assert ps["net_pay"] == 24_800.0


def test_payslip_blank_statutory_lines() -> None:
    employee = {
        "hra_monthly": None,
        "conveyance_monthly": None,
        "special_allowance_monthly": None,
        "pf_employee_monthly": None,
        "income_tax_tds_monthly": None,
        "professional_tax": None,
    }
    ps = compute_payslip(
        employee,
        month=1,
        year=2026,
        calendar_days=30,
        present_days=20,
        absent_attendance_days=2,
        weekoff_days=5,
        holiday_days=4,
        salary_eligible_days=29,
        monthly_salary=50_000.0,
        lop_days=0,
    )
    assert ps["display"]["pf_blank"] is True
    assert ps["display"]["professional_tax_blank"] is True
    assert ps["display"]["tds_blank"] is True
    assert ps["deductions"]["pf_employee"] is None
    assert ps["deductions"]["professional_tax"] is None
    assert ps["deductions"]["total"] == 0.0
    assert ps["net_pay"] == ps["earnings"]["gross_earned"]


def test_gross_earned_prorated_for_in_progress_month() -> None:
    """June 18 → earnings accrue 18/30 of full monthly gross."""
    employee = {
        "hra_monthly": None,
        "conveyance_monthly": None,
        "special_allowance_monthly": 299.0,
        "pf_employee_monthly": None,
        "income_tax_tds_monthly": None,
        "professional_tax": 130.0,
    }
    ps = compute_payslip(
        employee,
        month=6,
        year=2026,
        calendar_days=30,
        present_days=3,
        absent_attendance_days=4,
        weekoff_days=2,
        holiday_days=0,
        salary_eligible_days=5,
        monthly_salary=21_000.0,
        lop_days=0,
        period_end=date(2026, 6, 18),
    )
    assert ps["earnings_elapsed_factor"] == 0.6
    assert ps["earnings"]["salary"] == 12_600.0
    assert ps["earnings"]["special_allowance"] == 299.0
    assert ps["earnings"]["gross_earned"] == 12_899.0
    assert ps["net_pay"] == 12_769.0


def test_gross_earned_full_when_month_complete() -> None:
    employee = {
        "hra_monthly": None,
        "conveyance_monthly": None,
        "special_allowance_monthly": 299.0,
        "pf_employee_monthly": None,
        "income_tax_tds_monthly": None,
        "professional_tax": 130.0,
    }
    ps = compute_payslip(
        employee,
        month=5,
        year=2026,
        calendar_days=30,
        present_days=23,
        absent_attendance_days=0,
        weekoff_days=5,
        holiday_days=0,
        salary_eligible_days=28,
        monthly_salary=21_000.0,
        lop_days=0,
        period_end=date(2026, 5, 31),
    )
    assert ps["earnings"]["gross_earned"] == 21_299.0


def _emp() -> dict:
    return {
        "hra_monthly": None,
        "conveyance_monthly": None,
        "special_allowance_monthly": None,
        "pf_employee_monthly": None,
        "income_tax_tds_monthly": None,
        "professional_tax": None,
    }


def test_salary_starts_from_first_attendance_upload_in_progress_month() -> None:
    """Joined Oct 6, payroll checked Oct 18 → 13/30 paid; days 1–5 (incl. week-off) earn nothing."""
    ps = compute_payslip(
        _emp(),
        month=10,
        year=2026,
        calendar_days=30,
        present_days=9,
        absent_attendance_days=0,
        weekoff_days=2,
        holiday_days=0,
        salary_eligible_days=11,
        monthly_salary=30_000.0,
        lop_days=0,
        period_end=date(2026, 10, 18),
        period_start=date(2026, 10, 6),
    )
    assert ps["earnings_elapsed_factor"] == round(13 / 30, 6)
    assert ps["earnings"]["salary"] == 13_000.0
    assert ps["paid_salary_days"] == 25.0


def test_salary_starts_from_first_attendance_upload_completed_month() -> None:
    """Joined Oct 6, month complete → 25/30 of salary; 1 LOP day still deducted at daily rate."""
    ps = compute_payslip(
        _emp(),
        month=10,
        year=2026,
        calendar_days=30,
        present_days=20,
        absent_attendance_days=1,
        weekoff_days=4,
        holiday_days=1,
        salary_eligible_days=25,
        monthly_salary=30_000.0,
        lop_days=1,
        period_end=date(2026, 10, 31),
        period_start=date(2026, 10, 6),
    )
    assert ps["earnings"]["salary"] == 25_000.0
    assert ps["deductions"]["lop_deduction"] == 1_000.0
    assert ps["net_pay"] == 24_000.0
    assert ps["paid_salary_days"] == 24.0


def test_period_start_in_earlier_month_does_not_prorate() -> None:
    ps = compute_payslip(
        _emp(),
        month=10,
        year=2026,
        calendar_days=30,
        present_days=22,
        absent_attendance_days=0,
        weekoff_days=4,
        holiday_days=0,
        salary_eligible_days=26,
        monthly_salary=30_000.0,
        period_end=date(2026, 10, 31),
        period_start=date(2026, 3, 6),
    )
    assert ps["earnings"]["salary"] == 30_000.0
    assert ps["paid_salary_days"] == 30.0

"""Payslip PDF generation (no I/O)."""

from __future__ import annotations

from datetime import date

from services.payslip_pdf_service import (
    _format_balance_leave,
    _format_days,
    build_payslip_pdf_bytes,
)


def _sample_employee() -> dict:
    return {
        "name": "Aman Dey",
        "employee_code": "EMP0001",
        "department": "IT",
        "designation": "Software Developer",
        "salary_monthly": 21_000.0,
        "hra_monthly": None,
        "conveyance_monthly": None,
        "special_allowance_monthly": 299.0,
        "pf_employee_monthly": None,
        "income_tax_tds_monthly": None,
        "professional_tax": 130.0,
    }


def test_format_balance_leave_and_days() -> None:
    assert _format_balance_leave(20.0, 19.0) == "19 days"
    assert _format_balance_leave(0.0, 0.0) == "- days"
    assert _format_balance_leave(None, None) == "- days"
    assert _format_days(1.0) == "1 days"
    assert _format_days(0.0) == "0 days"


def test_payslip_pdf_includes_leave_section() -> None:
    pdf = build_payslip_pdf_bytes(
        _sample_employee(),
        month=5,
        year=2026,
        calendar_days=30,
        present_days=23,
        absent_attendance_days=1,
        weekoff_days=5,
        holiday_days=0,
        salary_eligible_days=28,
        monthly_salary=21_000.0,
        leave_covered_days=1.0,
        lop_days=0.0,
        total_leave=20.0,
        balance_leave=19.0,
        period_end=date(2026, 5, 31),
    )
    assert isinstance(pdf, bytes)
    assert len(pdf) > 500
    assert pdf.startswith(b"%PDF")


def test_payslip_pdf_balance_leave_dash_when_no_allocation() -> None:
    pdf = build_payslip_pdf_bytes(
        _sample_employee(),
        month=5,
        year=2026,
        calendar_days=30,
        present_days=23,
        absent_attendance_days=0,
        weekoff_days=5,
        holiday_days=0,
        salary_eligible_days=28,
        monthly_salary=21_000.0,
        leave_covered_days=0.0,
        lop_days=0.0,
        total_leave=0.0,
        balance_leave=0.0,
        period_end=date(2026, 5, 31),
    )
    assert isinstance(pdf, bytes)
    assert len(pdf) > 500

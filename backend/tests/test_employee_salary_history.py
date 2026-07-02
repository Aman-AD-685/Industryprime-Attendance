"""Unit tests for effective-dated employee salary history."""

from __future__ import annotations

from services.employee_salary_history_service import (
    resolve_salary_for_month,
    salary_display_meta,
)


def test_resolve_salary_uses_latest_row_on_or_before_payroll_month() -> None:
    history = [
        {"salary_monthly": 50000, "effective_year": 2026, "effective_month": 7},
        {"salary_monthly": 40000, "effective_year": 2000, "effective_month": 1},
    ]
    assert resolve_salary_for_month(history, month=6, year=2026, fallback_salary=0) == 40000
    assert resolve_salary_for_month(history, month=7, year=2026, fallback_salary=0) == 50000
    assert resolve_salary_for_month(history, month=8, year=2026, fallback_salary=0) == 50000


def test_resolve_salary_falls_back_to_employee_column() -> None:
    assert resolve_salary_for_month([], month=3, year=2026, fallback_salary=35000) == 35000


def test_salary_display_meta_shows_previous_until_prior_month() -> None:
    history = [
        {"salary_monthly": 50000, "effective_year": 2026, "effective_month": 7},
        {"salary_monthly": 40000, "effective_year": 2000, "effective_month": 1},
    ]
    meta = salary_display_meta(history)
    assert meta["salary_effective_year"] == 2026
    assert meta["salary_effective_month"] == 7
    assert meta["previous_salary_monthly"] == 40000
    assert meta["previous_salary_effective_until_year"] == 2026
    assert meta["previous_salary_effective_until_month"] == 6

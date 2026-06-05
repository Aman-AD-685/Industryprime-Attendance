"""Unit tests for monthly leave balance snapshot (Leave page + payroll)."""

from __future__ import annotations

from services.leave_service import leave_month_balance_snapshot


def test_absents_fully_covered_by_leave_balance() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=20,
        month_absent_days=3,
        ytd_absent_before_month=5,
    )
    assert snap["leave_covered_days"] == 3
    assert snap["lop_days"] == 0
    assert snap["balance_leave"] == 15
    assert snap["total_used_leave"] == 3


def test_absents_partially_covered_lop_reduces_salary() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=20,
        month_absent_days=5,
        ytd_absent_before_month=18,
    )
    assert snap["leave_covered_days"] == 2
    assert snap["lop_days"] == 3
    assert snap["balance_leave"] == 2
    assert snap["leave_exhausted"] is True


def test_no_leave_balance_all_absent_is_lop() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=0,
        month_absent_days=4,
        ytd_absent_before_month=0,
    )
    assert snap["leave_covered_days"] == 0
    assert snap["lop_days"] == 4
    assert snap["balance_leave"] == 0


def test_monthly_lop_zero_when_no_absents_this_month() -> None:
    """Prior-year LOP must not appear when viewing a month with zero absents."""
    snap = leave_month_balance_snapshot(
        total_leave=21,
        month_absent_days=0,
        ytd_absent_before_month=22,
    )
    assert snap["lop_days"] == 0
    assert snap["balance_leave"] == 0
    assert snap["total_used_leave"] == 0


def test_adrija_zero_leave_one_absent() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=0,
        month_absent_days=1,
        ytd_absent_before_month=0,
    )
    assert snap["balance_leave"] == 0
    assert snap["lop_days"] == 1


def test_one_absent_with_21_allocation() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=21,
        month_absent_days=1,
        ytd_absent_before_month=0,
    )
    assert snap["balance_leave"] == 21
    assert snap["lop_days"] == 0
    assert snap["leave_covered_days"] == 1

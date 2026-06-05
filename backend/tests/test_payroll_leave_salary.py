"""Unit tests for monthly leave balance snapshot (Leave page + payroll)."""

from __future__ import annotations

from services.leave_service import leave_month_balance_snapshot


def test_absents_fully_covered_by_leave_balance() -> None:
    snap = leave_month_balance_snapshot(total_leave=20, month_absent_days=3)
    assert snap["leave_covered_days"] == 3
    assert snap["lop_days"] == 0
    assert snap["balance_leave"] == 17
    assert snap["total_used_leave"] == 3


def test_absents_partially_covered_lop_reduces_salary() -> None:
    snap = leave_month_balance_snapshot(total_leave=20, month_absent_days=25)
    assert snap["leave_covered_days"] == 20
    assert snap["lop_days"] == 5
    assert snap["balance_leave"] == 0
    assert snap["leave_exhausted"] is True


def test_no_leave_balance_all_absent_is_lop() -> None:
    snap = leave_month_balance_snapshot(total_leave=0, month_absent_days=4)
    assert snap["leave_covered_days"] == 0
    assert snap["lop_days"] == 4
    assert snap["balance_leave"] == 0


def test_one_absent_with_21_allocation_matches_leave_page() -> None:
    """Aman-style: 21 CL+SL, 1 absent in May → balance 20, no LOP."""
    snap = leave_month_balance_snapshot(total_leave=21, month_absent_days=1)
    assert snap["balance_leave"] == 20
    assert snap["lop_days"] == 0
    assert snap["leave_covered_days"] == 1

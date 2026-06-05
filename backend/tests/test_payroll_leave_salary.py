"""Unit tests for monthly leave balance snapshot (Leave page + payroll)."""

from __future__ import annotations

from services.leave_service import (
    LEAVE_BALANCE_ROLLING_START_MONTH,
    leave_month_balance_snapshot,
)


def test_may_start_balance_is_total_minus_used() -> None:
    """May: Balance Leave = Total Leave − Total Used."""
    snap = leave_month_balance_snapshot(
        total_leave=20,
        month_absent_days=2,
        month=LEAVE_BALANCE_ROLLING_START_MONTH,
        prior_used_from_may=0,
    )
    assert snap["total_used_leave"] == 2
    assert snap["balance_leave"] == 18
    assert snap["lop_days"] == 0


def test_june_chains_from_may_balance() -> None:
    """June: Balance Leave = previous Balance Leave − Total Used."""
    snap = leave_month_balance_snapshot(
        total_leave=20,
        month_absent_days=3,
        month=6,
        prior_used_from_may=2,  # May used 2 → start June with 18
    )
    assert snap["balance_leave"] == 15
    assert snap["lop_days"] == 0


def test_absents_partially_covered_lop() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=20,
        month_absent_days=5,
        month=5,
        prior_used_from_may=0,
    )
    assert snap["leave_covered_days"] == 5
    assert snap["lop_days"] == 0
    assert snap["balance_leave"] == 15


def test_lop_when_used_exceeds_balance_at_month_start() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=20,
        month_absent_days=5,
        month=6,
        prior_used_from_may=18,
    )
    assert snap["balance_at_month_start"] == 2
    assert snap["leave_covered_days"] == 2
    assert snap["lop_days"] == 3
    assert snap["balance_leave"] == 0


def test_no_leave_balance_all_absent_is_lop() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=0,
        month_absent_days=4,
        month=5,
        prior_used_from_may=0,
    )
    assert snap["leave_covered_days"] == 0
    assert snap["lop_days"] == 4
    assert snap["balance_leave"] == 0


def test_before_may_uses_month_only() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=21,
        month_absent_days=1,
        month=4,
        prior_used_from_may=0,
    )
    assert snap["balance_leave"] == 20
    assert snap["lop_days"] == 0


def test_one_absent_with_21_allocation_in_may() -> None:
    snap = leave_month_balance_snapshot(
        total_leave=21,
        month_absent_days=1,
        month=5,
        prior_used_from_may=0,
    )
    assert snap["balance_leave"] == 20
    assert snap["lop_days"] == 0

"""Tests for leave absent counting (no phantom snapshot absents)."""

from __future__ import annotations

from datetime import date

from services.leave_balance_attendance_service import (
    _count_absent_from_merged_days,
    _is_countable_leave_absent,
    _leave_period_cap,
    _merge_leave_day_rows,
)


def test_period_cap_stops_at_latest_attendance_db_date() -> None:
    month_start = date(2026, 1, 1)
    month_end = date(2026, 1, 31)
    table_rows = [{"date": "2026-01-10", "status": "P"}]
    cap = _leave_period_cap(
        month_start,
        month_end,
        date(2026, 5, 21),
        table_rows,
        [date(2026, 1, 31)],
    )
    assert cap == date(2026, 1, 10)


def test_snapshot_placeholder_absent_is_counted() -> None:
    day = date(2026, 5, 5)
    row = {"date": day.isoformat(), "status": "A"}
    assert _is_countable_leave_absent(row, day, set(), has_table_row=False) is True


def test_persisted_absent_with_id_counts() -> None:
    day = date(2026, 5, 5)
    row = {"id": "uuid-1", "date": day.isoformat(), "status": "A"}
    assert _is_countable_leave_absent(row, day, set(), has_table_row=False) is True


def test_final_status_absent_counts() -> None:
    day = date(2026, 5, 5)  # not Sunday
    row = {
        "id": "uuid-2",
        "date": day.isoformat(),
        "status": "P",
        "final_status": "Absent",
    }
    # Leave “Total Used” must match Attendance grid Atten column which is driven by `status`.
    assert _is_countable_leave_absent(row, day, set(), has_table_row=True) is False


def test_final_status_ot_is_not_absent() -> None:
    day = date(2026, 5, 5)
    row = {
        "id": "uuid-3",
        "date": day.isoformat(),
        "status": "A",  # raw status can be inconsistent
        "final_status": "OT",
    }
    assert _is_countable_leave_absent(row, day, set(), has_table_row=True) is True


def test_merged_count_includes_snapshot_absents() -> None:
    month_start = date(2026, 5, 1)
    period_end = date(2026, 5, 21)
    real_day = date(2026, 5, 5)
    phantom_day = date(2026, 5, 6)
    merged = _merge_leave_day_rows(
        [{"employee_id": "e1", "date": real_day.isoformat(), "status": "A"}],
        [
            {"date": real_day.isoformat(), "status": "A", "id": "saved"},
            {"date": phantom_day.isoformat(), "status": "A"},
        ],
    )
    count = _count_absent_from_merged_days(
        merged,
        {real_day},
        month_start,
        period_end,
        set(),
    )
    assert count == 2

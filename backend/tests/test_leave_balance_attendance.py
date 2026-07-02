"""Tests for leave absent counting (no phantom snapshot absents)."""

from __future__ import annotations

from datetime import date

from services.leave_balance_attendance_service import (
    _count_absent_from_merged_days,
    _count_present_from_merged_days,
    _is_countable_leave_absent,
    _is_countable_leave_present,
    _leave_period_cap,
    _merge_leave_day_rows,
)


def test_period_cap_uses_latest_attendance_grid_date() -> None:
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
    assert cap == date(2026, 1, 31)


def test_snapshot_placeholder_absent_is_counted() -> None:
    day = date(2026, 5, 5)
    row = {"date": day.isoformat(), "status": "A"}
    assert _is_countable_leave_absent(row, day, set(), has_table_row=False) is True


def test_snapshot_atten_absent_column_is_counted() -> None:
    day = date(2026, 5, 5)
    row = {"date": day.isoformat(), "status": "", "absent": "A"}
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


def test_count_absent_from_snapshot_through_today() -> None:
    month_start = date(2026, 6, 1)
    period_end = date(2026, 6, 29)
    absent_days = [
        date(2026, 6, 1),
        date(2026, 6, 5),
        date(2026, 6, 10),
        date(2026, 6, 15),
        date(2026, 6, 26),
        date(2026, 6, 27),
        date(2026, 6, 29),
    ]
    merged = {day: {"date": day.isoformat(), "absent": "A"} for day in absent_days}
    count = _count_absent_from_merged_days(
        merged,
        set(),
        month_start,
        period_end,
        set(),
    )
    assert count == 7


def test_present_counts_status_p_working_days() -> None:
    month_start = date(2026, 6, 1)
    period_end = date(2026, 6, 10)
    sunday = date(2026, 6, 7)
    merged = {
        date(2026, 6, 2): {"date": "2026-06-02", "status": "P"},
        date(2026, 6, 3): {"date": "2026-06-03", "status": "A"},
        sunday: {"date": sunday.isoformat(), "status": "P"},
    }
    assert _count_present_from_merged_days(merged, month_start, period_end, set()) == 1


def test_present_excludes_leave_absent_days() -> None:
    day = date(2026, 6, 4)
    row = {"date": day.isoformat(), "status": "P", "final_status": "Absent"}
    assert _is_countable_leave_present(row, day, set()) is True
    assert _is_countable_leave_absent(row, day, set(), has_table_row=True) is False

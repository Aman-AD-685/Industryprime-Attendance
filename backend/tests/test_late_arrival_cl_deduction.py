"""Late-arrival CL+SL rule from Oct 2026: Late (no CL) / Half Day (0.5) / Full Day CL (1.0)."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List

from services.attendance_management_service import calculate_attendance_row, late_arrival_cl_deduction
from services.leave_balance_attendance_service import (
    _sum_late_cl_from_merged_days,
    compute_absent_leave_used_by_months,
    compute_leave_attendance_days_by_months,
)

MON = date(2026, 10, 5)


def test_boundaries_on_a_working_day() -> None:
    assert late_arrival_cl_deduction(MON, "09:31") == 0.0
    assert late_arrival_cl_deduction(MON, "09:32") == 0.0  # Late only
    assert late_arrival_cl_deduction(MON, "11:01") == 0.0  # Late only
    assert late_arrival_cl_deduction(MON, "11:02") == 0.5
    assert late_arrival_cl_deduction(MON, "13:30") == 0.5
    assert late_arrival_cl_deduction(MON, "13:31") == 1.0
    assert late_arrival_cl_deduction(MON, "13:31:45") == 1.0  # DB time with seconds


def test_not_before_october_2026_and_not_on_sunday() -> None:
    assert late_arrival_cl_deduction(date(2026, 9, 30), "12:00") == 0.0
    assert late_arrival_cl_deduction(date(2026, 10, 1), "12:00") == 0.5
    assert late_arrival_cl_deduction(date(2026, 10, 4), "12:00") == 0.0  # Sunday
    assert late_arrival_cl_deduction(MON, None) == 0.0


def test_attendance_row_labels() -> None:
    def label(in_time: str, out_time: str | None = "18:30") -> str:
        return calculate_attendance_row(MON, {"in_time": in_time, "out_time": out_time})["status_ot_sf"]

    assert label("10:00") == "Late"
    assert label("11:30") == "Half Day"
    assert label("14:00") == "Full Day CL"
    assert label("11:30", None) == "Half Day"  # IN without OUT
    assert calculate_attendance_row(date(2026, 9, 1), {"in_time": "14:00", "out_time": "18:30"})["status_ot_sf"] == "Late"


def test_sum_late_cl_skips_absent_and_holidays() -> None:
    merged = {
        date(2026, 10, 5): {"status": "P", "check_in": "11:30:00"},  # 0.5
        date(2026, 10, 6): {"status": "P", "check_in": "14:00:00"},  # 1.0
        date(2026, 10, 7): {"status": "A", "check_in": None},  # absent: counted elsewhere
        date(2026, 10, 8): {"status": "P", "check_in": "14:00:00"},  # holiday
        date(2026, 10, 9): {"status": "P", "in_time": "12:00"},  # snapshot-only row
        date(2026, 10, 10): {"status": "P", "check_in": "10:30:00"},  # Late only
    }
    total = _sum_late_cl_from_merged_days(merged, date(2026, 10, 1), date(2026, 10, 31), {"2026-10-08"})
    assert total == 2.0


class _FakeSupabase:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self.rows = rows

    def select(self, table: str, **kw: Any) -> List[Dict[str, Any]]:
        return list(self.rows) if table == "attendance" else []


_ROWS = [
    {"employee_id": "e1", "date": "2026-10-05", "status": "P", "check_in": "11:30:00"},
    {"employee_id": "e1", "date": "2026-10-06", "status": "A", "check_in": None},
    {"employee_id": "e1", "date": "2026-10-07", "status": "P", "check_in": "14:00:00"},
]


def test_leave_used_adds_late_cl_to_absents() -> None:
    sb = _FakeSupabase(_ROWS)
    today = date(2026, 10, 8)
    absent, present, _, late_cl = compute_leave_attendance_days_by_months(sb, {"e1"}, [10], 2026, today=today)
    assert absent[10]["e1"] == 1
    assert present[10]["e1"] == 2
    assert late_cl[10]["e1"] == 1.5

    used, _ = compute_absent_leave_used_by_months(sb, {"e1"}, [10], 2026, today=today)
    assert used[10]["e1"] == 2.5


def test_left_date_caps_leave_period() -> None:
    sb = _FakeSupabase(_ROWS)
    absent, present, period, late_cl = compute_leave_attendance_days_by_months(
        sb, {"e1"}, [10], 2026, today=date(2026, 10, 8), period_end_by_eid={"e1": date(2026, 10, 6)}
    )
    assert (absent[10]["e1"], present[10]["e1"], late_cl[10]["e1"]) == (1, 1, 0.5)
    assert period[10]["e1"] == "2026-10-06"

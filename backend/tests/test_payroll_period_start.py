"""Payroll buckets start at the first uploaded attendance date (no week-off / absent credit before it)."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List

from services.leave_balance_attendance_service import (
    compute_leave_attendance_days_by_months,
    first_attendance_date_by_employee,
)
from services.payroll_attendance_summary_service import compute_payroll_attendance_metrics


class _FakeSupabase:
    """Minimal stand-in: attendance rows for one employee from Oct 6; nothing else."""

    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self.rows = rows

    def select(self, table: str, **kw: Any) -> List[Dict[str, Any]]:
        if table != "attendance":
            return []
        out = sorted(self.rows, key=lambda r: r["date"])
        if kw.get("where_eq", {}).get("employee_id"):
            out = [r for r in out if r["employee_id"] == kw["where_eq"]["employee_id"]]
        if kw.get("limit") == 1:
            out = out[:1]
        return out


_ROWS = [
    {"employee_id": "e1", "date": "2026-10-06", "status": "P", "final_status": "OK"},
    {"employee_id": "e1", "date": "2026-10-07", "status": "A", "final_status": "Absent"},
    {"employee_id": "e1", "date": "2026-10-08", "status": "P", "final_status": "OK"},
]


def test_first_attendance_date_is_min_date() -> None:
    assert first_attendance_date_by_employee(_FakeSupabase(_ROWS), {"e1", "e2"}) == {"e1": date(2026, 10, 6)}


def test_payroll_buckets_ignore_days_before_first_upload() -> None:
    sb = _FakeSupabase(_ROWS)
    today = date(2026, 10, 8)
    starts = first_attendance_date_by_employee(sb, {"e1"})

    # Without a start, Sat 3rd + Sun 4th (no rows) would be paid week-offs.
    before, _ = compute_payroll_attendance_metrics(sb, {"e1"}, 10, 2026, today=today)
    assert before["e1"]["weekoff_days"] == 2

    after, _ = compute_payroll_attendance_metrics(sb, {"e1"}, 10, 2026, today=today, period_start_by_eid=starts)
    assert after["e1"]["weekoff_days"] == 0
    assert after["e1"]["present_days"] == 2
    assert after["e1"]["absent_days"] == 1
    assert after["e1"]["attendance_period_start"] == "2026-10-06"
    # Future week-offs (Sun 11th) are not counted before today.
    assert after["e1"]["attendance_period_end"] == "2026-10-08"


def test_leave_counts_ignore_days_before_first_upload() -> None:
    rows = _ROWS + [{"employee_id": "e1", "date": "2026-10-01", "status": "A"}]
    sb = _FakeSupabase(rows)
    absent, present, _, _ = compute_leave_attendance_days_by_months(
        sb, {"e1"}, [10], 2026, today=date(2026, 10, 8), period_start_by_eid={"e1": date(2026, 10, 6)}
    )
    assert absent[10]["e1"] == 1
    assert present[10]["e1"] == 2

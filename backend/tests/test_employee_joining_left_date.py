"""Joining date starts the salary count; left date pauses it."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, List

from services.employee_employment import (
    employment_period_by_employee,
    employment_status_patch_payload,
    is_employee_visible_for_month,
)
from services.payroll_attendance_summary_service import compute_payroll_attendance_metrics


def test_hidden_before_joining_month() -> None:
    emp = {"employment_status": "current", "joining_date": "2026-10-15"}
    assert is_employee_visible_for_month(emp, 9, 2026) is False
    assert is_employee_visible_for_month(emp, 10, 2026) is True
    assert is_employee_visible_for_month(emp, 11, 2026) is True


def test_left_patch_sets_left_date_and_current_clears_it() -> None:
    left = employment_status_patch_payload("left", today=date(2026, 10, 13))
    assert left["left_date"] == "2026-10-13"
    assert (left["left_effective_month"], left["left_effective_year"]) == (10, 2026)
    assert employment_status_patch_payload("current")["left_date"] is None


def test_employment_period_by_employee() -> None:
    rows = [
        {"id": "e1", "joining_date": "2026-10-06", "employment_status": "current"},
        {"id": "e2", "employment_status": "left", "left_date": "2026-10-20"},
        {"id": "e3", "employment_status": "current", "left_date": "2026-10-20"},  # stale, ignored
        {"id": "e4"},
    ]
    starts, ends = employment_period_by_employee(rows)
    assert starts == {"e1": date(2026, 10, 6)}
    assert ends == {"e2": date(2026, 10, 20)}


class _FakeSupabase:
    def __init__(self, rows: List[Dict[str, Any]]) -> None:
        self.rows = rows

    def select(self, table: str, **kw: Any) -> List[Dict[str, Any]]:
        return list(self.rows) if table == "attendance" else []


def test_payroll_buckets_stop_at_left_date() -> None:
    rows = [
        {"employee_id": "e1", "date": f"2026-10-{d:02d}", "status": "P", "final_status": "OK"}
        for d in (5, 6, 7, 8, 9, 10, 12, 13)
    ]
    sb = _FakeSupabase(rows)
    today = date(2026, 10, 13)
    full, _ = compute_payroll_attendance_metrics(sb, {"e1"}, 10, 2026, today=today)
    assert full["e1"]["present_days"] == 8

    capped, _ = compute_payroll_attendance_metrics(
        sb, {"e1"}, 10, 2026, today=today, period_end_by_eid={"e1": date(2026, 10, 7)}
    )
    assert capped["e1"]["present_days"] == 3
    assert capped["e1"]["attendance_period_end"] == "2026-10-07"

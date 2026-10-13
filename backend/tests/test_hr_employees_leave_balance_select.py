"""Guard: leave_balances select must only name real columns, else all reads fall back to defaults."""

from services.hr_employees import LEAVE_BALANCE_SELECT


def test_leave_balance_select_matches_schema() -> None:
    assert LEAVE_BALANCE_SELECT.split(",") == ["employee_id", "year", "total_leave"]

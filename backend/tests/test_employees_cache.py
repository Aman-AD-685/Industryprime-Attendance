"""Employee roster is cached briefly and refetched after any write."""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

import services.hr_employees as hr


class _FakeSupabase:
    def __init__(self) -> None:
        self.calls = 0
        self.rows: List[Dict[str, Any]] = [{"id": "e1", "name": "A"}]

    def select(self, table: str, **kw: Any) -> List[Dict[str, Any]]:
        self.calls += 1
        return [dict(r) for r in self.rows]


@pytest.fixture(autouse=True)
def _reset():
    hr.invalidate_employees_cache()
    hr._date_columns_missing_until = 0.0
    yield
    hr.invalidate_employees_cache()


def test_second_read_is_served_from_cache() -> None:
    sb = _FakeSupabase()
    assert hr.select_all_employees(sb)[0]["name"] == "A"
    assert hr.select_all_employees(sb)[0]["name"] == "A"
    assert sb.calls == 1


def test_cached_rows_are_copies() -> None:
    sb = _FakeSupabase()
    first = hr.select_all_employees(sb)
    first[0]["name"] = "mutated"
    assert hr.select_all_employees(sb)[0]["name"] == "A"


def test_invalidate_refetches() -> None:
    sb = _FakeSupabase()
    hr.select_all_employees(sb)
    sb.rows[0]["name"] = "B"
    hr.invalidate_employees_cache()
    assert hr.select_all_employees(sb)[0]["name"] == "B"
    assert sb.calls == 2


def test_missing_date_columns_fall_back_once_per_minute() -> None:
    class _Legacy(_FakeSupabase):
        def select(self, table: str, **kw: Any) -> List[Dict[str, Any]]:
            self.calls += 1
            if "joining_date" in kw.get("select", ""):
                raise RuntimeError("column employees.joining_date does not exist")
            return [dict(r) for r in self.rows]

    sb = _Legacy()
    assert hr.select_all_employees(sb)[0]["id"] == "e1"
    assert sb.calls == 2  # failed new-column select + legacy select
    hr.invalidate_employees_cache()
    hr.select_all_employees(sb)
    assert sb.calls == 3  # failing select skipped while the memo is fresh

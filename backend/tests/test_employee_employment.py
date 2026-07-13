from services.employee_employment import (
    employment_status_patch_payload,
    filter_employees_for_month,
    is_employee_visible_for_month,
)


def test_current_employee_always_visible():
    emp = {"employment_status": "current"}
    assert is_employee_visible_for_month(emp, 8, 2026) is True


def test_left_visible_in_mark_month_only():
    emp = {"employment_status": "left", "left_effective_month": 7, "left_effective_year": 2026}
    assert is_employee_visible_for_month(emp, 7, 2026) is True
    assert is_employee_visible_for_month(emp, 8, 2026) is False
    assert is_employee_visible_for_month(emp, 6, 2026) is True


def test_left_hidden_after_year_boundary():
    emp = {"employment_status": "left", "left_effective_month": 12, "left_effective_year": 2025}
    assert is_employee_visible_for_month(emp, 1, 2026) is False


def test_employment_status_patch_left_sets_month():
    payload = employment_status_patch_payload("left")
    assert payload["employment_status"] == "left"
    assert payload["left_effective_month"] is not None
    assert payload["left_effective_year"] is not None


def test_filter_employees_for_month():
    rows = [
        {"id": "1", "employment_status": "current"},
        {"id": "2", "employment_status": "left", "left_effective_month": 7, "left_effective_year": 2026},
    ]
    visible = filter_employees_for_month(rows, 8, 2026)
    assert [r["id"] for r in visible] == ["1"]

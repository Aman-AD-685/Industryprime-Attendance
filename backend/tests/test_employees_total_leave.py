"""Add / Edit employee can set the annual CL + SL allotment (leave_balances.total_leave)."""

from __future__ import annotations

from unittest.mock import patch

from starlette.testclient import TestClient

_ROW = {"id": "emp-1", "employee_code": "EMP0001", "name": "New Hire", "email": "n@test.invalid"}


def test_post_employee_writes_total_leave(
    client: TestClient, admin_auth_headers: dict[str, str], mock_supabase: object
) -> None:
    mock_supabase.select.return_value = [{"employee_id": "emp-1", "year": 2026, "total_leave": 12}]
    with (
        patch("routers.employees.get_supabase_user", return_value=mock_supabase),
        patch("routers.employees.create_employee", return_value=dict(_ROW)),
        patch("routers.employees.enrich_employees_with_salary_meta", side_effect=lambda _sb, rows: rows),
        patch("routers.employees.update_leave_allocation") as upd,
    ):
        r = client.post(
            "/employees",
            json={"name": "New Hire", "at_div_code": "9", "total_leave": 12},
            headers=admin_auth_headers,
        )
    assert r.status_code == 200, r.text
    upd.assert_called_once()
    assert upd.call_args.args[0] == "emp-1" and upd.call_args.args[2] == 12.0
    assert r.json()["total_leave"] == 12.0


def test_patch_employee_without_total_leave_leaves_allocation_alone(
    client: TestClient, admin_auth_headers: dict[str, str], mock_supabase: object
) -> None:
    mock_supabase.select.return_value = [dict(_ROW)]
    with (
        patch("routers.employees.get_supabase_user", return_value=mock_supabase),
        patch("routers.employees.update_employee", return_value=dict(_ROW)),
        patch("routers.employees.enrich_employees_with_salary_meta", side_effect=lambda _sb, rows: rows),
        patch("routers.employees.update_leave_allocation") as upd,
    ):
        r = client.patch("/employees/emp-1", json={"name": "New Hire", "at_div_code": "9"}, headers=admin_auth_headers)
    assert r.status_code == 200, r.text
    upd.assert_not_called()

"""API tests for payroll routes with external services mocked."""

from __future__ import annotations

from unittest.mock import patch

from starlette.testclient import TestClient


def test_payroll_summary_requires_auth(client: TestClient) -> None:
    r = client.get("/payroll/summary?month=5&year=2026")
    assert r.status_code == 401


def test_payroll_summary_ok_with_mocks(
    client: TestClient,
    admin_auth_headers: dict[str, str],
    mock_supabase: object,
) -> None:
    payload = {
        "month": 5,
        "year": 2026,
        "items": [
            {
                "employee": {
                    "id": "emp-1",
                    "employee_code": "EMP0001",
                    "name": "Test",
                    "salary_monthly": 10000,
                },
                "month": 5,
                "year": 2026,
                "total_days": 31,
                "total_days_present": 20,
                "payslip": {"net_pay": 9500},
            }
        ],
    }
    with patch("routers.payroll.summarize_payroll", return_value=payload) as sm:
        with patch("routers.payroll.get_supabase_user", return_value=mock_supabase):
            r = client.get("/payroll/summary?month=5&year=2026", headers=admin_auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["month"] == 5
    assert len(body["items"]) == 1
    sm.assert_called_once()


def test_payslip_pdf_requires_auth(client: TestClient) -> None:
    r = client.get("/payroll/payslip-pdf?month=5&year=2026&employee_id=e1")
    assert r.status_code == 401


def test_payslip_pdf_forbidden_for_user_role(
    client: TestClient,
    user_auth_headers: dict[str, str],
) -> None:
    r = client.get(
        "/payroll/payslip-pdf?month=5&year=2026&employee_id=e1",
        headers=user_auth_headers,
    )
    assert r.status_code == 403


def test_payroll_summary_strips_payslip_for_user(
    client: TestClient,
    user_auth_headers: dict[str, str],
    mock_supabase: object,
) -> None:
    payload = {
        "month": 5,
        "year": 2026,
        "items": [{"employee": {"id": "emp-1"}, "payslip": {"net_pay": 9500}}],
    }
    with patch("routers.payroll.summarize_payroll", return_value=payload):
        with patch("routers.payroll.get_supabase_user", return_value=mock_supabase):
            r = client.get("/payroll/summary?month=5&year=2026", headers=user_auth_headers)
    assert r.status_code == 200
    item = r.json()["items"][0]
    assert "payslip" not in item

from unittest.mock import MagicMock

import pytest

from services.leave_service import decide_leave_request_for_tenant, is_pending_leave_request


def test_is_pending_leave_request():
    assert is_pending_leave_request({"status": "pending"}) is True
    assert is_pending_leave_request({"status": "PENDING"}) is True
    assert is_pending_leave_request({}) is True
    assert is_pending_leave_request({"status": "approved"}) is False
    assert is_pending_leave_request({"status": "rejected"}) is False
    assert is_pending_leave_request({"status": "pending", "approved_at": "2026-01-01"}) is False
    assert is_pending_leave_request({"status": "pending", "decision_token_used": True}) is False


def test_decide_leave_falls_back_without_tenant_match():
    supabase = MagicMock()
    supabase.select.return_value = [{"id": "leave-1", "status": "pending", "tenant_id": "legacy-tenant"}]

    def _update(**kwargs):
        if kwargs.get("where_eq") == {"id": "leave-1"}:
            return {"id": "leave-1", "status": "approved"}
        return None

    supabase.update_single.side_effect = _update

    updated = decide_leave_request_for_tenant(
        request_id="leave-1",
        decision="approved",
        tenant_id="admin-user-id",
        supabase=supabase,
        decided_by_email="approver@example.com",
    )

    assert updated["status"] == "approved"
    where_list = [call.kwargs["where_eq"] for call in supabase.update_single.call_args_list]
    assert {"id": "leave-1", "tenant_id": "admin-user-id"} in where_list
    assert {"id": "leave-1"} in where_list


def test_decide_leave_rejects_already_decided():
    supabase = MagicMock()
    supabase.select.return_value = [{"id": "leave-1", "status": "approved"}]

    with pytest.raises(ValueError, match="already decided"):
        decide_leave_request_for_tenant(
            request_id="leave-1",
            decision="approved",
            tenant_id="admin-user-id",
            supabase=supabase,
        )

    supabase.update_single.assert_not_called()

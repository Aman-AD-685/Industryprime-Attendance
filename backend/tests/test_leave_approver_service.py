from unittest.mock import patch

from services.leave_approver_service import can_approve_leave, is_leave_approver_email


def test_is_leave_approver_email_matches_approval_list():
    with patch("services.leave_approver_service.get_supabase_service") as mock_db:
        mock_db.return_value.select.return_value = [{"email": "approver@example.com"}]
        assert is_leave_approver_email("Approver@Example.com") is True
        assert is_leave_approver_email("other@example.com") is False


def test_can_approve_leave_admin_without_email_list():
    assert can_approve_leave(role="admin", email="nobody@example.com") is True
    assert can_approve_leave(role="master_admin", email="nobody@example.com") is True


def test_can_approve_leave_user_on_email_list():
    with patch("services.leave_approver_service.is_leave_approver_email", return_value=True):
        assert can_approve_leave(role="user", email="approver@example.com") is True


def test_can_approve_leave_user_not_on_email_list():
    with patch("services.leave_approver_service.is_leave_approver_email", return_value=False):
        assert can_approve_leave(role="user", email="user@example.com") is False

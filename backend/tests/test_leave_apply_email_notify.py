from unittest.mock import MagicMock, patch

from services.leave_apply_email_notify import notify_leave_apply_recipients


def _db_with_lists(approvals, notifications, applicants):
    db = MagicMock()

    def select(*, table, where_eq=None, **kwargs):
        if table != "email_lists":
            return []
        kind = (where_eq or {}).get("kind")
        if kind == "approval":
            return approvals
        if kind == "notification":
            return notifications
        if kind == "applicant":
            if (where_eq or {}).get("email"):
                email = where_eq["email"]
                return [r for r in applicants if r["email"] == email]
            return applicants
        return []

    db.select.side_effect = select
    return db


@patch("services.leave_apply_email_notify.send_email", return_value=True)
@patch("services.leave_apply_email_notify.render_email_template", return_value="<p>ok</p>")
@patch("services.leave_apply_email_notify.public_base_url_for_email", return_value="https://app.example")
def test_mapped_applicant_sends_approval_to_approver_not_global_list(_base, _render, send_email):
    db = _db_with_lists(
        [{"email": "global@industryprime.com", "name": "Global"}],
        [{"email": "fyi@industryprime.com", "name": "FYI"}],
        [
            {
                "email": "ea@industryprime.com",
                "name": "Souvik Das",
                "approver_email": "boss@industryprime.com",
            }
        ],
    )
    summary = notify_leave_apply_recipients(
        employee={"email": "ea@industryprime.com", "name": "Souvik Das"},
        leave_id="leave-1",
        from_date="2026-07-09",
        to_date="2026-07-09",
        reason="Test",
        supabase=db,
    )
    recipients = [call.args[0] for call in send_email.call_args_list]
    assert "boss@industryprime.com" in recipients
    assert "global@industryprime.com" not in recipients
    assert "ea@industryprime.com" in recipients
    assert summary["emails_sent_approval"] == 1
    assert summary["applicant_approver_email"] == "boss@industryprime.com"


@patch("services.leave_apply_email_notify.send_email", return_value=True)
@patch("services.leave_apply_email_notify.render_email_template", return_value="<p>ok</p>")
@patch("services.leave_apply_email_notify.public_base_url_for_email", return_value="https://app.example")
def test_applicant_id_skipped_from_global_notification(_base, _render, send_email):
    db = _db_with_lists(
        [],
        [{"email": "ea@industryprime.com", "name": "Dup"}],
        [{"email": "ea@industryprime.com", "name": "Souvik Das", "approver_email": "boss@industryprime.com"}],
    )
    notify_leave_apply_recipients(
        employee={"email": "ea@industryprime.com", "name": "Souvik Das"},
        leave_id="leave-2",
        from_date="2026-07-09",
        to_date="2026-07-09",
        reason="Test",
        supabase=db,
    )
    recipients = [call.args[0] for call in send_email.call_args_list]
    assert recipients.count("ea@industryprime.com") == 1
    assert "fyi@industryprime.com" not in recipients


@patch("services.leave_apply_email_notify.send_email", return_value=True)
@patch("services.leave_apply_email_notify.render_email_template", return_value="<p>ok</p>")
@patch("services.leave_apply_email_notify.public_base_url_for_email", return_value="https://app.example")
def test_no_mapping_uses_global_approval(_base, _render, send_email):
    db = _db_with_lists(
        [{"email": "global@industryprime.com", "name": "Global"}],
        [],
        [],
    )
    summary = notify_leave_apply_recipients(
        employee={"email": "other@industryprime.com", "name": "Other"},
        leave_id="leave-3",
        from_date="2026-07-09",
        to_date="2026-07-09",
        reason="Test",
        supabase=db,
    )
    assert send_email.call_args_list[0].args[0] == "global@industryprime.com"
    assert summary["emails_sent_approval"] == 1

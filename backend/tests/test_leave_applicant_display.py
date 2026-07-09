from unittest.mock import MagicMock, patch

from services.leave_applicant_display import (
    applicant_id_mail_for_notify,
    resolve_leave_applicant_display,
    send_leave_applicant_id_notification,
)


def test_resolve_uses_email_lists_applicant_mapping():
    db = MagicMock()
    db.select.return_value = [{"email": "ea@industryprime.com", "name": "Souvik Das"}]
    email, name = resolve_leave_applicant_display(
        {"email": "ea@industryprime.com", "name": "Wrong Name"},
        supabase=db,
    )
    assert email == "ea@industryprime.com"
    assert name == "Souvik Das"


def test_resolve_matches_by_employee_name_when_email_differs():
    db = MagicMock()
    db.select.side_effect = [
        [],
        [{"email": "ea@industryprime.com", "name": "Souvik Das"}],
    ]
    email, name = resolve_leave_applicant_display(
        {"email": "other@industryprime.com", "name": "Souvik Das"},
        supabase=db,
    )
    assert email == "ea@industryprime.com"
    assert name == "Souvik Das"


def test_resolve_falls_back_to_employee_name():
    db = MagicMock()
    db.select.side_effect = [[], []]
    email, name = resolve_leave_applicant_display(
        {"email": "user@example.com", "name": "Aman Dey"},
        supabase=db,
    )
    assert email == "user@example.com"
    assert name == "Aman Dey"


def test_applicant_id_mail_for_notify_returns_mapped_email():
    db = MagicMock()
    db.select.return_value = [{"email": "ea@industryprime.com", "name": "Souvik Das"}]
    assert (
        applicant_id_mail_for_notify({"email": "ea@industryprime.com", "name": "Souvik Das"}, supabase=db)
        == "ea@industryprime.com"
    )


@patch("services.email_service.send_email", return_value=True)
@patch("services.email_service.render_email_template", return_value="<p>ok</p>")
def test_send_leave_applicant_id_notification_skips_duplicates(_render, send_email):
    db = MagicMock()
    db.select.return_value = [{"email": "ea@industryprime.com", "name": "Souvik Das"}]
    sent = send_leave_applicant_id_notification(
        employee={"email": "ea@industryprime.com", "name": "Souvik Das"},
        applicant_name="Souvik Das",
        applicant_email="ea@industryprime.com",
        from_date="2026-07-09",
        to_date="2026-07-09",
        reason="Test",
        already_notified={"ea@industryprime.com"},
        supabase=db,
    )
    assert sent is False
    send_email.assert_not_called()

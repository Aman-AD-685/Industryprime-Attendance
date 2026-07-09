from unittest.mock import MagicMock

from services.leave_applicant_display import (
    applicant_id_mail_for_notify,
    resolve_leave_applicant_display,
)


def test_resolve_uses_email_lists_applicant_mapping():
    db = MagicMock()
    db.select.return_value = [
        {"email": "ea@industryprime.com", "name": "Souvik Das", "approver_email": "boss@industryprime.com"}
    ]
    email, name = resolve_leave_applicant_display(
        {"email": "ea@industryprime.com", "name": "Wrong Name"},
        supabase=db,
    )
    assert email == "ea@industryprime.com"
    assert name == "Souvik Das"


def test_applicant_approver_email():
    from services.leave_applicant_display import applicant_approver_email

    db = MagicMock()
    db.select.return_value = [
        {"email": "ea@industryprime.com", "name": "Souvik Das", "approver_email": "boss@industryprime.com"}
    ]
    assert (
        applicant_approver_email({"email": "ea@industryprime.com", "name": "Souvik Das"}, supabase=db)
        == "boss@industryprime.com"
    )


def test_resolve_matches_by_employee_name_when_email_differs():
    db = MagicMock()
    db.select.side_effect = [
        [],
        [{"email": "ea@industryprime.com", "name": "Souvik Das", "approver_email": "boss@industryprime.com"}],
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

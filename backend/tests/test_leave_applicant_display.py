from unittest.mock import MagicMock

from services.leave_applicant_display import resolve_leave_applicant_display


def test_resolve_uses_email_lists_applicant_mapping():
    db = MagicMock()
    db.select.return_value = [{"email": "ea@industryprime.com", "name": "Souvik Das"}]
    email, name = resolve_leave_applicant_display(
        {"email": "ea@industryprime.com", "name": "Wrong Name"},
        supabase=db,
    )
    assert email == "ea@industryprime.com"
    assert name == "Souvik Das"


def test_resolve_falls_back_to_employee_name():
    db = MagicMock()
    db.select.return_value = []
    email, name = resolve_leave_applicant_display(
        {"email": "user@example.com", "name": "Aman Dey"},
        supabase=db,
    )
    assert email == "user@example.com"
    assert name == "Aman Dey"

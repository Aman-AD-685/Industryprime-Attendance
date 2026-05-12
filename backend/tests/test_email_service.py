import os

import pytest

from services import email_service


def test_send_email_log_mode_skips_postmark(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setenv("EMAIL_MODE", "log")
    # Ensure no token (would fail if Postmark path ran).
    for k in (
        "POSTMARK_SERVER_TOKEN",
        "POSTMARK_SMTP_TOKEN",
        "POSTMARK_SMTP_SECRET_KEY",
        "POSTMARK_SMTP_Secret_key",
    ):
        monkeypatch.delenv(k, raising=False)
    caplog.set_level("INFO")
    email_service.send_email(
        to="approver@example.com",
        subject="Leave test",
        html="<p>hello</p>",
        text="hello",
    )
    assert email_service.email_delivery_mode() == "log"
    assert any("EMAIL_MODE=log" in r.message for r in caplog.records)
    assert any("approver@example.com" in r.message for r in caplog.records)


def test_email_delivery_mode_aliases(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_MODE", "local")
    assert email_service.email_delivery_mode() == "log"
    monkeypatch.setenv("EMAIL_MODE", "postmark")
    assert email_service.email_delivery_mode() == "postmark"

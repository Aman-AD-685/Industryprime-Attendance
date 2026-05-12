import pytest
from typing import Any

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
    assert email_service.send_email(
        to="approver@example.com",
        subject="Leave test",
        html="<p>hello</p>",
        text="hello",
    ) is True
    assert email_service.email_delivery_mode() == "log"
    assert any("EMAIL_MODE=log" in r.message for r in caplog.records)
    assert any("approver@example.com" in r.message for r in caplog.records)


def test_postmark_token_accepts_access_key_alias(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("POSTMARK_SERVER_TOKEN", raising=False)
    monkeypatch.delenv("POSTMARK_SMTP_TOKEN", raising=False)
    monkeypatch.setenv("POSTMARK_Access_Key", "test-server-token-value")
    assert email_service.postmark_token_configured()


def test_email_delivery_mode_aliases(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_MODE", "local")
    assert email_service.email_delivery_mode() == "log"
    monkeypatch.setenv("EMAIL_MODE", "postmark")
    assert email_service.email_delivery_mode() == "postmark"


def test_force_postmark_api_ignores_smtp_delivery_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Settings test email must not use SMTP when POSTMARK_DELIVERY=smtp on Render."""
    monkeypatch.setenv("EMAIL_MODE", "postmark")
    monkeypatch.setenv("POSTMARK_SERVER_TOKEN", "fake-token-for-test")
    monkeypatch.setenv("POSTMARK_DELIVERY", "smtp")

    calls: list[str] = []

    def fake_rest(**kwargs: Any) -> None:
        calls.append("rest")

    monkeypatch.setattr(email_service, "_send_postmark_rest", fake_rest)

    assert email_service.send_email(
        "u@example.com",
        "subj",
        "<p>x</p>",
        "x",
        force_postmark_api=True,
    )
    assert calls == ["rest"]


def test_send_email_without_postmark_token_returns_false(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("EMAIL_MODE", "postmark")
    for k in (
        "POSTMARK_SERVER_TOKEN",
        "POSTMARK_SMTP_TOKEN",
        "POSTMARK_SMTP_SECRET_KEY",
        "POSTMARK_SMTP_Secret_key",
    ):
        monkeypatch.delenv(k, raising=False)
    caplog.set_level("WARNING")
    ok = email_service.send_email(
        to="x@example.com",
        subject="Hi",
        html="<p>a</p>",
        text="a",
    )
    assert ok is False
    assert any("Postmark token not set" in r.message for r in caplog.records)

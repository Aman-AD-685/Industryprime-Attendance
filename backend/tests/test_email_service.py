import pytest
from unittest.mock import MagicMock, patch

from services import email_service


def test_send_email_log_mode_skips_smtp(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setenv("EMAIL_MODE", "log")
    for k in (
        "POSTMARK_SMTP_TOKEN",
        "POSTMARK_SMTP_SECRET_KEY",
        "POSTMARK_SMTP_Secret_key",
        "POSTMARK_SMTP_USERNAME",
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


def test_smtp_token_strips_quotes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POSTMARK_SMTP_TOKEN", '"  my-secret-token  "')
    assert email_service._smtp_password() == "my-secret-token"


def test_smtp_username_defaults_to_password(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("POSTMARK_SMTP_TOKEN", "same-for-both")
    monkeypatch.delenv("POSTMARK_SMTP_USERNAME", raising=False)
    assert email_service._smtp_username() == "same-for-both"


def test_email_delivery_mode_aliases(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_MODE", "local")
    assert email_service.email_delivery_mode() == "log"
    monkeypatch.setenv("EMAIL_MODE", "postmark")
    assert email_service.email_delivery_mode() == "postmark"


def test_send_email_without_smtp_token_returns_false(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("EMAIL_MODE", "postmark")
    monkeypatch.delenv("POSTMARK_SMTP_TOKEN", raising=False)
    monkeypatch.delenv("POSTMARK_SMTP_SECRET_KEY", raising=False)
    monkeypatch.delenv("POSTMARK_SMTP_Secret_key", raising=False)
    caplog.set_level("WARNING")
    ok = email_service.send_email(
        to="x@example.com",
        subject="Hi",
        html="<p>a</p>",
        text="a",
    )
    assert ok is False
    assert any("SMTP credentials not set" in r.message for r in caplog.records)


def test_send_email_uses_smtp_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EMAIL_MODE", "postmark")
    monkeypatch.setenv("POSTMARK_SMTP_TOKEN", "secret")
    monkeypatch.setenv("POSTMARK_SMTP_USERNAME", "user")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "from@example.com")

    mock_smtp = MagicMock()
    mock_ctx = MagicMock()
    mock_ctx.__enter__.return_value = mock_smtp
    mock_ctx.__exit__.return_value = None

    with patch("services.email_service.smtplib.SMTP", return_value=mock_ctx):
        assert email_service.send_email("to@example.com", "Subj", "<p>h</p>", "t") is True

    mock_smtp.starttls.assert_called()
    mock_smtp.login.assert_called_once_with("user", "secret")
    mock_smtp.send_message.assert_called_once()


def test_log_email_smtp_startup_logs_mode(monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
    monkeypatch.setenv("EMAIL_MODE", "postmark")
    monkeypatch.setenv("POSTMARK_SMTP_TOKEN", "x")
    caplog.set_level("INFO")
    email_service.log_email_smtp_startup()
    assert any("Email delivery: mode=" in r.message for r in caplog.records)
    assert any("credentials_loaded=True" in r.message for r in caplog.records)

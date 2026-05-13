from __future__ import annotations

import logging
import os
import smtplib
import time
from pathlib import Path
from email.message import EmailMessage
from typing import Any, Dict, Optional

try:
    from jinja2 import Environment, FileSystemLoader, TemplateNotFound, select_autoescape
except Exception:  # pragma: no cover - optional dependency runtime fallback
    Environment = None  # type: ignore
    FileSystemLoader = None  # type: ignore
    TemplateNotFound = Exception  # type: ignore
    select_autoescape = None  # type: ignore

from database.supabase_client import _bootstrap_backend_env

logger = logging.getLogger(__name__)

# Signup/OTP paths raise this if SMTP cannot send (kept export name for existing imports).
MISSING_POSTMARK_ON_API_HOST_MESSAGE = (
    "Email (SMTP) is not configured on the FastAPI host. Set POSTMARK_SMTP_HOST (default smtp.postmarkapp.com), "
    "POSTMARK_SMTP_PORT (587), POSTMARK_SMTP_USERNAME, POSTMARK_SMTP_TOKEN (Postmark Server API token used as SMTP "
    "password; username is often the same token or your PM-T-… value from Postmark), and SMTP_FROM_EMAIL or "
    "POSTMARK_FROM_EMAIL on Render or backend/.env, then redeploy."
)

_MISSING_SMTP_CONFIG = MISSING_POSTMARK_ON_API_HOST_MESSAGE

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "emails"
_jinja = (
    Environment(
        loader=FileSystemLoader(str(_TEMPLATE_DIR)),
        autoescape=select_autoescape(enabled_extensions=("html", "xml")),
    )
    if Environment and FileSystemLoader and select_autoescape
    else None
)


def _env(name: str, default: str = "") -> str:
    _bootstrap_backend_env()
    return os.getenv(name, default).strip()


def _normalize_smtp_secret(raw: str) -> str:
    t = (raw or "").strip()
    if len(t) >= 2 and t[0] == t[-1] and t[0] in "\"'":
        t = t[1:-1].strip()
    return t


def _smtp_password() -> str:
    return _normalize_smtp_secret(
        _env("POSTMARK_SMTP_TOKEN")
        or _env("POSTMARK_SMTP_SECRET_KEY")
        or _env("POSTMARK_SMTP_Secret_key")
    )


def _smtp_username() -> str:
    u = _normalize_smtp_secret(_env("POSTMARK_SMTP_USERNAME"))
    if u:
        return u
    # Postmark SMTP: many setups use the server token as both username and password.
    return _smtp_password()


def smtp_credentials_configured() -> bool:
    """True when POSTMARK_SMTP_TOKEN (and derived username) are set for outbound SMTP."""
    return bool(_smtp_password())


def postmark_token_configured() -> bool:
    """Backward-compatible alias: means SMTP credentials are present."""
    return smtp_credentials_configured()


def email_delivery_mode() -> str:
    """
    postmark — send via Postmark SMTP (POSTMARK_SMTP_*).
    log — no outbound mail; log intended recipients only.
    """
    m = _env("EMAIL_MODE", "postmark").lower()
    if m in ("log", "console", "local", "disabled", "dry_run", "dry-run"):
        return "log"
    return "postmark"


def _from_email() -> str:
    return (
        _env("SMTP_FROM_EMAIL")
        or _env("POSTMARK_FROM_EMAIL")
        or _env("FROM_EMAIL")
        or "aman@industryprime.com"
    )


def _message_stream() -> str:
    return (
        _env("SMTP_POSTMARK_STREAM")
        or _env("POSTMARK_MESSAGE_STREAM")
        or _env("POSTMARK_STREAM")
        or "outbound"
    )


def _smtp_config() -> Dict[str, str]:
    password = _smtp_password()
    if not password:
        raise RuntimeError(_MISSING_SMTP_CONFIG)
    username = _smtp_username()
    if not username:
        raise RuntimeError(_MISSING_SMTP_CONFIG)
    return {
        "host": _env("POSTMARK_SMTP_HOST", "smtp.postmarkapp.com"),
        "port": _env("POSTMARK_SMTP_PORT", "587") or "587",
        "username": username,
        "password": password,
    }


def log_email_smtp_startup() -> None:
    """Log SMTP mode and whether credentials exist (never log secrets)."""
    mode = email_delivery_mode()
    host = _env("POSTMARK_SMTP_HOST", "smtp.postmarkapp.com")
    port = _env("POSTMARK_SMTP_PORT", "587") or "587"
    creds = smtp_credentials_configured()
    logger.info(
        "Email delivery: mode=%s SMTP host=%s port=%s credentials_loaded=%s",
        mode,
        host,
        port,
        creds,
    )


def render_email_template(template_name: str, context: Dict[str, Any]) -> str:
    if _jinja is None:
        return (
            f"<html><body><h3>IndustryPrime</h3><p>Template: {template_name}</p>"
            f"<pre>{context}</pre><p>Sent by IndustryPrime · aman@industryprime.com</p></body></html>"
        )
    try:
        tpl = _jinja.get_template(template_name)
    except TemplateNotFound as exc:
        raise RuntimeError(f"Missing email template: {template_name}") from exc
    return tpl.render(**context)


def _test_redirect_address() -> str:
    raw = _env("EMAIL_TEST_REDIRECT", "")
    if not raw or "@" not in raw:
        return ""
    return raw.strip().lower()


def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    text: Optional[str] = None,
) -> bool:
    """
    Send via Postmark SMTP only (TLS on port 587). Returns True on success or EMAIL_MODE=log.
    Returns False when credentials are missing (leave flow); raises on SMTP errors.
    """
    recipients: list[str]
    if isinstance(to, str):
        recipients = [to.strip()]
    else:
        recipients = [str(addr).strip() for addr in to if str(addr).strip()]
    if not recipients:
        raise RuntimeError("send_email requires at least one recipient")

    if email_delivery_mode() == "log":
        preview = (html or "")[:800].replace("\n", " ")
        logger.info(
            "EMAIL_MODE=log — would send subject=%r to=%s html_preview=%s",
            subject,
            recipients,
            preview,
        )
        return True

    if not smtp_credentials_configured():
        preview = (html or "")[:800].replace("\n", " ")
        logger.warning(
            "SMTP credentials not set (POSTMARK_SMTP_TOKEN required); skipping send subject=%r to=%s",
            subject,
            recipients,
        )
        logger.info("Intended email (not sent) html_preview=%s", preview)
        return False

    redirect = _test_redirect_address()
    if redirect:
        orig_txt = ", ".join(recipients)
        recipients = [redirect]
        subject = f"[TEST redirect] {subject}"
        inject = (
            f'<hr><p style="font-size:12px;color:#444"><strong>Test redirect:</strong> '
            f"would have gone to: {orig_txt}</p>"
        )
        html = f"{html or ''}{inject}"
        if text:
            text = f"{text}\n\n[Test redirect — intended recipients: {orig_txt}]"
        else:
            text = f"[Test redirect — intended recipients: {orig_txt}]"

    sender = _from_email()
    stream = _message_stream()

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = ", ".join(recipients)
    msg["X-PM-Message-Stream"] = stream
    msg.set_content(text or "This email requires an HTML-capable client.")
    msg.add_alternative(html, subtype="html")

    attempts = 2
    last_exc: Optional[Exception] = None
    for i in range(attempts):
        try:
            conf = _smtp_config()
            with smtplib.SMTP(conf["host"], int(conf["port"]), timeout=30) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                smtp.login(conf["username"], conf["password"])
                smtp.send_message(msg)
            logger.info("SMTP email sent subject=%s to=%s stream=%s", subject, recipients, stream)
            return True
        except Exception as exc:
            last_exc = exc
            exc_text = str(exc).lower()
            transient = "timeout" in exc_text or "temporar" in exc_text or "try again" in exc_text
            if i < attempts - 1 and transient:
                time.sleep(0.6)
                continue
            if "timeout" in exc_text:
                raise RuntimeError(
                    "SMTP connection timed out connecting to Postmark (smtp.postmarkapp.com:587). "
                    "Some cloud hosts block outbound SMTP; verify Render allows egress on 587 or use a host that does."
                ) from exc
            raise

    if last_exc:
        raise last_exc
    raise RuntimeError("SMTP send did not complete")  # pragma: no cover

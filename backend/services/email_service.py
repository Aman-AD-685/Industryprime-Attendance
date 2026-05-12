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

# Shown when POSTMARK_* are unset on the Python process (Supabase Dashboard SMTP is unrelated).
# Exported for signup/OTP paths that must fail closed if mail cannot be sent.
MISSING_POSTMARK_ON_API_HOST_MESSAGE = (
    "Postmark is not configured on the FastAPI server (this is separate from Supabase). "
    "Supabase Dashboard → Authentication → Email/SMTP only affects Supabase Auth emails (e.g. magic links), "
    "not leave or OTP mail from this app. Set POSTMARK_SERVER_TOKEN (or POSTMARK_SMTP_TOKEN / POSTMARK_Access_Key) "
    "plus POSTMARK_FROM_EMAIL or SMTP_FROM_EMAIL on the host that runs the API (Render/Railway/backend/.env), "
    "then redeploy. Use POSTMARK_DELIVERY=api on Render (SMTP port 587 is often blocked). "
    "Or set EMAIL_MODE=log to log only (no Postmark required)."
)

_MISSING_POSTMARK_ON_API_HOST = MISSING_POSTMARK_ON_API_HOST_MESSAGE

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


def postmark_token_configured() -> bool:
    """True if a Postmark server/SMTP token is present (required for real delivery when EMAIL_MODE=postmark)."""
    return bool(_postmark_server_token())


def email_delivery_mode() -> str:
    """
    postmark — real delivery via Postmark (requires POSTMARK_SERVER_TOKEN / SMTP token + FROM).
    log — no outbound mail; send_email logs intended recipients (use on API host until Postmark is set).
    """
    m = _env("EMAIL_MODE", "postmark").lower()
    if m in ("log", "console", "local", "disabled", "dry_run", "dry-run"):
        return "log"
    return "postmark"


def _postmark_server_token() -> str:
    """Postmark Server API token (same value used for SMTP password on most accounts)."""
    return (
        _env("POSTMARK_SERVER_TOKEN")
        or _env("POSTMARK_SMTP_TOKEN")
        or _env("POSTMARK_SMTP_SECRET_KEY")
        or _env("POSTMARK_SMTP_Secret_key")
        # Render / dashboards sometimes use these names:
        or _env("POSTMARK_Access_Key")
        or _env("POSTMARK_ACCESS_KEY")
    )


def _postmark_from_email() -> str:
    return (
        _env("POSTMARK_FROM_EMAIL")
        or _env("SMTP_FROM_EMAIL")
        or _env("FROM_EMAIL")
        or "aman@industryprime.com"
    )


def _postmark_message_stream() -> str:
    return (
        _env("POSTMARK_MESSAGE_STREAM")
        or _env("SMTP_POSTMARK_STREAM")
        or _env("POSTMARK_STREAM")
        or "outbound"
    )


def _smtp_config() -> Dict[str, str]:
    # Support both preferred names and legacy aliases used in local env files.
    password = _postmark_server_token()
    if not password:
        raise RuntimeError(_MISSING_POSTMARK_ON_API_HOST)
    username = (
        _env("POSTMARK_SMTP_USERNAME")
        or _env("POSTMARK_SMTP_ACCESS_KEY")
        or _env("POSTMARK_SMTP_Access_Key")
        or _env("POSTMARK_Access_Key")
        or _env("POSTMARK_ACCESS_KEY")
        or password
    )
    return {
        "host": _env("POSTMARK_SMTP_HOST", "smtp.postmarkapp.com"),
        "port": _env("POSTMARK_SMTP_PORT", "587") or "587",
        "username": username,
        "password": password,
    }


def _send_postmark_rest(
    *,
    recipients: list[str],
    subject: str,
    html: str,
    text: Optional[str],
    sender: str,
    stream: str,
) -> None:
    """
    HTTPS delivery to Postmark (api.postmarkapp.com). Prefer this in production when
    outbound SMTP (port 587) is blocked; uses the same server token as SMTP.
    Sends one API call per recipient (Postmark-recommended for tracking and fewer rejections).
    """
    try:
        from postmarker.core import PostmarkClient
        from postmarker.exceptions import ClientError
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("Install postmarker (see backend/requirements.txt)") from exc
    token = _postmark_server_token()
    if not token:
        raise RuntimeError(_MISSING_POSTMARK_ON_API_HOST)
    timeout_raw = _env("POSTMARK_API_TIMEOUT", "30") or "30"
    try:
        timeout_sec = max(5, min(120, int(timeout_raw)))
    except ValueError:
        timeout_sec = 30
    client = PostmarkClient(server_token=token, timeout=timeout_sec)
    text_body = text or "This email requires an HTML-capable client."
    for addr in recipients:
        kwargs: Dict[str, Any] = {
            "From": sender,
            "To": addr,
            "Subject": subject,
            "HtmlBody": html,
            "TextBody": text_body,
        }
        if stream:
            kwargs["MessageStream"] = stream
        try:
            resp = client.emails.send(**kwargs)
        except ClientError as exc:
            code = getattr(exc, "error_code", None)
            msg = str(exc)
            logger.error("Postmark API rejected email to=%s code=%s: %s", addr, code, msg)
            raise RuntimeError(
                f"Postmark API error (check From/sender domain and server token; sandbox tokens do not deliver to real inboxes): {msg}"
            ) from exc
        mid = None
        if isinstance(resp, dict):
            mid = resp.get("MessageID") or resp.get("MessageId")
        logger.info("Postmark REST email sent to=%s MessageID=%s stream=%s", addr, mid, stream or "default")


def render_email_template(template_name: str, context: Dict[str, Any]) -> str:
    if _jinja is None:
        # Fallback keeps backend running when jinja2 is not installed yet.
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
    """If set, all recipients are replaced with this address (Postmark must still be configured)."""
    raw = _env("EMAIL_TEST_REDIRECT", "")
    if not raw or "@" not in raw:
        return ""
    return raw.strip().lower()


def send_email(
    to: str | list[str],
    subject: str,
    html: str,
    text: Optional[str] = None,
    *,
    force_postmark_api: bool = False,
) -> bool:
    """
    Send one message. Returns True if the message was accepted for delivery (Postmark API/SMTP success)
    or EMAIL_MODE=log (logged only, treated as success for workflows that allow dry-run).

    Returns False when EMAIL_MODE=postmark but no Postmark token is configured: logs intended recipients
    and does not raise (use for leave notifications). Signup/OTP should check the return value and raise.

    force_postmark_api: when True, send only via Postmark HTTPS (never SMTP). Used by Settings → test email
    so Render env POSTMARK_DELIVERY=smtp cannot hang on blocked port 587.
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

    if not postmark_token_configured():
        preview = (html or "")[:800].replace("\n", " ")
        logger.warning(
            "Postmark token not set on API host; skipping outbound email (Supabase Auth SMTP does not apply). "
            "subject=%r to=%s",
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

    sender = _postmark_from_email()
    stream = _postmark_message_stream()

    if force_postmark_api:
        _send_postmark_rest(
            recipients=recipients,
            subject=subject,
            html=html,
            text=text,
            sender=sender,
            stream=stream,
        )
        logger.info(
            "Postmark REST (forced for test email) subject=%s to=%s stream=%s",
            subject,
            recipients,
            stream,
        )
        return True

    # Default api: Postmark HTTPS (Render/Fly often block outbound SMTP 587 — avoids "timed out").
    # auto: same as api (no REST→SMTP fallback; use legacy only if you need that behavior).
    # smtp: SMTP only. legacy: try REST then SMTP on failure.
    mode = _env("POSTMARK_DELIVERY", "api").lower()
    if mode not in ("api", "rest", "http", "auto", "smtp", "legacy"):
        mode = "api"

    if mode in ("api", "rest", "http", "auto"):
        _send_postmark_rest(
            recipients=recipients,
            subject=subject,
            html=html,
            text=text,
            sender=sender,
            stream=stream,
        )
        logger.info("Postmark REST email sent subject=%s to=%s stream=%s", subject, recipients, stream)
        return True

    if mode == "legacy":
        try:
            _send_postmark_rest(
                recipients=recipients,
                subject=subject,
                html=html,
                text=text,
                sender=sender,
                stream=stream,
            )
            logger.info("Postmark REST email sent subject=%s to=%s stream=%s", subject, recipients, stream)
            return True
        except Exception as exc:
            logger.warning("Postmark REST send failed, falling back to SMTP (POSTMARK_DELIVERY=legacy): %s", exc)

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
            with smtplib.SMTP(conf["host"], int(conf["port"]), timeout=20) as smtp:
                smtp.ehlo()
                smtp.starttls()
                smtp.ehlo()
                smtp.login(conf["username"], conf["password"])
                smtp.send_message(msg)
            logger.info("Postmark SMTP email sent subject=%s to=%s stream=%s", subject, recipients, stream)
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
                    "Postmark SMTP connection timed out (common on Render when port 587 is blocked). "
                    "Set POSTMARK_DELIVERY=api (default) or remove POSTMARK_DELIVERY=smtp from the API host env, "
                    "then redeploy."
                ) from exc
            raise

    if last_exc:
        raise last_exc
    raise RuntimeError("Postmark SMTP send did not complete")  # pragma: no cover

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


def _postmark_server_token() -> str:
    """Postmark Server API token (same value used for SMTP password on most accounts)."""
    return (
        _env("POSTMARK_SERVER_TOKEN")
        or _env("POSTMARK_SMTP_TOKEN")
        or _env("POSTMARK_SMTP_SECRET_KEY")
        or _env("POSTMARK_SMTP_Secret_key")
    )


def _smtp_config() -> Dict[str, str]:
    # Support both preferred names and legacy aliases used in local env files.
    password = _postmark_server_token()
    if not password:
        raise RuntimeError(
            "Missing SMTP password env var. Set POSTMARK_SMTP_TOKEN "
            "(or POSTMARK_SERVER_TOKEN / POSTMARK_SMTP_SECRET_KEY)."
        )
    username = (
        _env("POSTMARK_SMTP_USERNAME")
        or _env("POSTMARK_SMTP_ACCESS_KEY")
        or _env("POSTMARK_SMTP_Access_Key")
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
        raise RuntimeError(
            "Missing Postmark token for REST API. Set POSTMARK_SERVER_TOKEN or POSTMARK_SMTP_TOKEN."
        )
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


def send_email(to: str | list[str], subject: str, html: str, text: Optional[str] = None) -> None:
    recipients: list[str]
    if isinstance(to, str):
        recipients = [to.strip()]
    else:
        recipients = [str(addr).strip() for addr in to if str(addr).strip()]
    if not recipients:
        raise RuntimeError("send_email requires at least one recipient")

    sender = _env("POSTMARK_FROM_EMAIL", "aman@industryprime.com")
    stream = _env("POSTMARK_MESSAGE_STREAM", "outbound")
    # auto: try Postmark HTTPS API first (works when cloud hosts block SMTP 587), then SMTP.
    # smtp: SMTP only. api: REST only (no fallback).
    mode = _env("POSTMARK_DELIVERY", "auto").lower()

    if mode in ("api", "rest", "http"):
        _send_postmark_rest(
            recipients=recipients,
            subject=subject,
            html=html,
            text=text,
            sender=sender,
            stream=stream,
        )
        logger.info("Postmark REST email sent subject=%s to=%s stream=%s", subject, recipients, stream)
        return

    if mode not in ("smtp", "legacy") and _postmark_server_token():
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
            return
        except Exception as exc:
            logger.warning("Postmark REST send failed, falling back to SMTP: %s", exc)

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
            return
        except Exception as exc:
            last_exc = exc
            exc_text = str(exc).lower()
            transient = "timeout" in exc_text or "temporar" in exc_text or "try again" in exc_text
            if i < attempts - 1 and transient:
                time.sleep(0.6)
                continue
            raise

    if last_exc:
        raise last_exc

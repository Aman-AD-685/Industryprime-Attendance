"""
Resolve the public browser origin for links embedded in emails (leave approval, etc.).

The API often runs on Render/Railway while the UI is on Vercel. If `FRONTEND_URL` is unset,
emails would otherwise point at http://localhost:3000 and break for recipients.
"""

from __future__ import annotations

import logging
import os
from typing import List, Optional

from database.supabase_client import _bootstrap_backend_env

logger = logging.getLogger(__name__)

# Used only when the process runs on a known managed host and no URL env is set.
# Override with FALLBACK_EMAIL_FRONTEND_URL for other deployments.
# Must match Vercel deploy (see DEPLOYMENT.md). Wrong host → access-denied on legacy app.
_DEFAULT_MANAGED_FALLBACK = "https://industryprime-attendance.vercel.app"


def _is_loopback_origin(url: str) -> bool:
    low = url.strip().lower()
    return (
        "localhost" in low
        or "127.0.0.1" in low
        or "[::1]" in low
        or "0.0.0.0" in low
    )


def _running_on_managed_host() -> bool:
    """Heuristic: API is deployed (not a typical laptop `uvicorn` dev session)."""
    keys = (
        "RENDER",
        "RAILWAY_ENVIRONMENT",
        "RAILWAY_PROJECT_ID",
        "FLY_APP_NAME",
        "K_SERVICE",  # Cloud Run
        "AWS_EXECUTION_ENV",
        "WEBSITE_SITE_NAME",  # Azure App Service
        "HEROKU_APP_NAME",
    )
    return any(os.getenv(k, "").strip() for k in keys)


def _first_non_loopback_from_env_list() -> List[str]:
    _bootstrap_backend_env()
    names = (
        "EMAIL_FRONTEND_URL",
        "FRONTEND_URL",
        "PUBLIC_APP_URL",
        "APP_PUBLIC_URL",
        "SITE_URL",
    )
    out: List[str] = []
    for name in names:
        raw = os.getenv(name, "")
        val = raw.strip().rstrip("/")
        if val and not _is_loopback_origin(val):
            out.append(val)
    return out


def _first_from_cors_origins() -> Optional[str]:
    for raw in os.getenv("CORS_ORIGINS", "").split(","):
        origin = raw.strip().rstrip("/")
        if origin and not _is_loopback_origin(origin):
            return origin
    return None


def public_base_url_for_email(*, log_context: str = "email") -> str:
    """
    Return https origin for links in outbound email. Never returns localhost on managed hosts
    when any fallback is configured (env or default constant). Postmark mode never uses localhost.
    """
    for candidate in _first_non_loopback_from_env_list():
        return candidate

    cors = _first_from_cors_origins()
    if cors:
        return cors

    if _running_on_managed_host():
        fallback = os.getenv("FALLBACK_EMAIL_FRONTEND_URL", _DEFAULT_MANAGED_FALLBACK).strip().rstrip("/")
        if fallback and not _is_loopback_origin(fallback):
            logger.warning(
                "%s: FRONTEND_URL / EMAIL_FRONTEND_URL not set; using FALLBACK_EMAIL_FRONTEND_URL "
                "or built-in default (%s). Set FRONTEND_URL on the API host for a stable configuration.",
                log_context,
                fallback,
            )
            return fallback

    url = "http://localhost:3000"
    try:
        from services.email_service import email_delivery_mode

        if email_delivery_mode() == "postmark" and _is_loopback_origin(url):
            fallback = os.getenv("FALLBACK_EMAIL_FRONTEND_URL", _DEFAULT_MANAGED_FALLBACK).strip().rstrip("/")
            if fallback and not _is_loopback_origin(fallback):
                logger.warning(
                    "%s: Postmark mode — email links use %s (not localhost). Set FRONTEND_URL on API host.",
                    log_context,
                    fallback,
                )
                return fallback
    except Exception:
        pass
    return url

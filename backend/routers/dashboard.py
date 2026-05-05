from __future__ import annotations

import hashlib
import os
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Query
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field

from services.dashboard_service import get_dashboard_summary
from dependencies.auth_dependency import get_auth_context
from database.supabase_client import get_supabase_user, get_supabase

router = APIRouter()


class AttendanceUploadTokenIssue(BaseModel):
    expires_days: int = Field(30, ge=1, le=365)
    label: Optional[str] = Field(default=None, max_length=120)


@router.get("/summary", response_model=Dict[str, Any])
def dashboard_summary(
    for_date: Optional[date] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    return get_dashboard_summary(
        for_date=for_date,
        tenant_id=auth.tenant_id,
        supabase=get_supabase_user(auth.access_token),
    )


@router.get("/attendance-entry-url", response_model=Dict[str, str])
def attendance_entry_share_url(authorization: Optional[str] = Header(default=None)):
    """Build the public Add Attendance URL (includes ?key= when ATTENDANCE_ENTRY_SECRET is set)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    get_auth_context(authorization=authorization)
    base = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    secret = os.getenv("ATTENDANCE_ENTRY_SECRET", "").strip()
    path = "/attendance-entry"
    if secret:
        url = f"{base}{path}?{urlencode({'key': secret})}"
    else:
        url = f"{base}{path}"
    return {"url": url}


@router.post("/attendance-upload-token", response_model=Dict[str, Any])
def issue_attendance_upload_token(
    body: AttendanceUploadTokenIssue,
    authorization: Optional[str] = Header(default=None),
):
    """One-time plaintext token for `/attendance-upload` (stored as SHA-256 hash). Master admin only."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    if auth.role != "master_admin":
        raise HTTPException(status_code=403, detail="Only master_admin can issue attendance upload tokens")
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    exp = datetime.now(timezone.utc) + timedelta(days=int(body.expires_days))
    # Service role so RLS does not block token storage.
    get_supabase().insert_many(
        table="attendance_upload_tokens",
        rows=[
            {
                "token_hash": token_hash,
                "expires_at": exp.replace(microsecond=0).isoformat(),
                "label": (body.label or "").strip() or None,
            },
        ],
    )
    return {"token": raw, "expires_at": exp.isoformat()}


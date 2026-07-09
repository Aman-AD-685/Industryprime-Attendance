from __future__ import annotations

import hashlib
import os
import secrets
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Query
from fastapi import Header, HTTPException
from pydantic import BaseModel, Field

from services.auth_service import require_role
from services.leave_approver_service import can_approve_leave
from services.dashboard_service import (
    get_attendance_trend,
    get_audit_events_dashboard,
    get_dashboard_summary,
    get_department_present_today,
    get_late_arrivals_today,
    get_pending_leaves_dashboard,
)
from dependencies.auth_dependency import get_auth_context
from database.supabase_client import get_supabase_user, get_supabase
from services.public_frontend_url import public_base_url_for_email

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
    require_role({"role": auth.role}, "master_admin", "admin")
    return get_dashboard_summary(
        for_date=for_date,
        tenant_id=auth.tenant_id,
        supabase=get_supabase_user(auth.access_token),
    )


@router.get("/trend", response_model=List[Dict[str, Any]])
def dashboard_trend(
    days: int = Query(default=14, ge=1, le=90),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    return get_attendance_trend(days=days, supabase=get_supabase_user(auth.access_token))


@router.get("/departments/present", response_model=List[Dict[str, Any]])
def dashboard_departments_present(
    for_date: Optional[date] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    return get_department_present_today(for_date=for_date, supabase=get_supabase_user(auth.access_token))


@router.get("/late-today", response_model=List[Dict[str, Any]])
def dashboard_late_today(
    for_date: Optional[date] = Query(default=None),
    department: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    return get_late_arrivals_today(
        for_date=for_date,
        department=department,
        supabase=get_supabase_user(auth.access_token),
    )


@router.get("/pending-leaves", response_model=List[Dict[str, Any]])
def dashboard_pending_leaves(
    limit: int = Query(default=80, ge=1, le=200),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    if not can_approve_leave(role=auth.role, email=auth.email):
        raise HTTPException(status_code=403, detail="Leave approval permission required")
    return get_pending_leaves_dashboard(
        tenant_id=auth.tenant_id,
        supabase=get_supabase_user(auth.access_token),
        limit=limit,
    )


@router.get("/audit", response_model=List[Dict[str, Any]])
def dashboard_audit(
    limit: int = Query(default=40, ge=1, le=100),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    return get_audit_events_dashboard(supabase=get_supabase_user(auth.access_token), limit=limit)


@router.get("/attendance-entry-url", response_model=Dict[str, str])
def attendance_entry_share_url(authorization: Optional[str] = Header(default=None)):
    """Build the public Add Attendance URL (includes ?key= when ATTENDANCE_ENTRY_SECRET is set)."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    get_auth_context(authorization=authorization)
    base = public_base_url_for_email(log_context="dashboard_attendance_entry_url")
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


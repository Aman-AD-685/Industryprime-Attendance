from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Path, Query
from pydantic import BaseModel, Field

from database.supabase_client import get_supabase_service
from dependencies.auth_dependency import get_auth_context
from services.auth_service import require_role
from services.email_service import (
    MISSING_POSTMARK_ON_API_HOST_MESSAGE,
    email_delivery_mode,
    send_email,
)

router = APIRouter()


def _is_missing_email_lists_table(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "email_lists" in msg and ("schema cache" in msg or "could not find the table" in msg or "pgrst205" in msg)


def _migration_hint() -> str:
    return "Email lists table is not migrated yet. Run backend/database/email_lists_schema.sql in Supabase SQL Editor."


def _clean_email(email: str) -> str:
    clean = str(email or "").strip().lower()
    if "@" not in clean or "." not in clean.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Invalid email format")
    return clean


def _require_master_admin(authorization: Optional[str]) -> str:
    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin")
    return auth.user_id


class EmailListCreateIn(BaseModel):
    kind: str = Field(..., pattern="^(approval|notification)$")
    email: str = Field(..., min_length=5, max_length=255)
    name: Optional[str] = Field(default=None, max_length=120)


class EmailListPatchIn(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)


class EmailTestIn(BaseModel):
    to_email: Optional[str] = Field(default=None, max_length=255)


@router.get("", response_model=List[Dict[str, Any]])
def list_email_lists(
    kind: str = Query(..., pattern="^(approval|notification)$"),
    authorization: Optional[str] = Header(default=None),
):
    _require_master_admin(authorization)
    try:
        return get_supabase_service().select(
            table="email_lists",
            select="id,kind,email,name,created_by,created_at",
            where_eq={"kind": kind},
            order="created_at.desc",
        )
    except RuntimeError as exc:
        if _is_missing_email_lists_table(exc):
            # Keep settings UI usable before migration: show empty lists instead of a 500.
            return []
        raise


@router.post("", response_model=Dict[str, Any])
def create_email_list(
    payload: EmailListCreateIn,
    authorization: Optional[str] = Header(default=None),
):
    user_id = _require_master_admin(authorization)
    row = {
        "kind": payload.kind,
        "email": _clean_email(payload.email),
        "name": payload.name.strip() if payload.name else None,
        "created_by": user_id,
    }
    try:
        rows = get_supabase_service().insert_many(
            table="email_lists",
            rows=[row],
            return_representation=True,
        )
    except RuntimeError as exc:
        if _is_missing_email_lists_table(exc):
            raise HTTPException(status_code=503, detail=_migration_hint()) from exc
        raise
    return rows[0] if rows else row


@router.patch("/{list_id}", response_model=Dict[str, Any])
def patch_email_list(
    payload: EmailListPatchIn,
    list_id: str = Path(...),
    authorization: Optional[str] = Header(default=None),
):
    _require_master_admin(authorization)
    try:
        updated = get_supabase_service().update_single(
            table="email_lists",
            payload={"name": payload.name.strip() if payload.name else None},
            where_eq={"id": list_id},
        )
    except RuntimeError as exc:
        if _is_missing_email_lists_table(exc):
            raise HTTPException(status_code=503, detail=_migration_hint()) from exc
        raise
    if not updated:
        raise HTTPException(status_code=404, detail="Email list item not found")
    return updated


@router.delete("/{list_id}", response_model=Dict[str, Any])
def delete_email_list(
    list_id: str = Path(...),
    authorization: Optional[str] = Header(default=None),
):
    _require_master_admin(authorization)
    try:
        get_supabase_service().delete_many(
            table="email_lists",
            where_eq={"id": list_id},
        )
    except RuntimeError as exc:
        if _is_missing_email_lists_table(exc):
            raise HTTPException(status_code=503, detail=_migration_hint()) from exc
        raise
    return {"ok": True}


@router.post("/test", response_model=Dict[str, Any])
def send_test_email(
    payload: EmailTestIn,
    authorization: Optional[str] = Header(default=None),
):
    _require_master_admin(authorization)
    db = get_supabase_service()
    to_email = _clean_email(payload.to_email) if payload.to_email else ""
    if not to_email:
        try:
            approvals = db.select(
                table="email_lists",
                select="email",
                where_eq={"kind": "approval"},
                order="created_at.desc",
                limit=1,
            )
            notifications = db.select(
                table="email_lists",
                select="email",
                where_eq={"kind": "notification"},
                order="created_at.desc",
                limit=1,
            )
            candidate = (approvals[0].get("email") if approvals else None) or (
                notifications[0].get("email") if notifications else None
            )
            to_email = _clean_email(str(candidate or ""))
        except RuntimeError as exc:
            if _is_missing_email_lists_table(exc):
                raise HTTPException(status_code=503, detail=_migration_hint()) from exc
            raise
    if not to_email:
        raise HTTPException(status_code=400, detail="Provide to_email or add at least one recipient in Email Lists.")

    html = (
        "<html><body><h3>IndustryPrime test email</h3>"
        "<p>This exercises the same <code>send_email</code> path as leave and OTP mail.</p>"
        "<p>Sent by IndustryPrime · aman@industryprime.com</p></body></html>"
    )
    try:
        ok = send_email(
            to=to_email,
            subject="IndustryPrime email delivery test",
            html=html,
            text="IndustryPrime email test: delivery successful (or EMAIL_MODE=log — see API logs).",
            force_postmark_api=True,
        )
    except Exception as exc:
        detail = str(exc)
        low = detail.lower()
        if "timed out" in low or "timeout" in low:
            detail += (
                " — On Render, outbound SMTP (port 587) is often blocked; use POSTMARK_DELIVERY=api "
                "(default in newer builds) on the API service and redeploy."
            )
        raise HTTPException(status_code=400, detail=f"Test email failed: {detail}") from exc
    if not ok:
        raise HTTPException(
            status_code=400,
            detail=MISSING_POSTMARK_ON_API_HOST_MESSAGE,
        )
    return {"ok": True, "to_email": to_email, "delivery_mode": email_delivery_mode()}

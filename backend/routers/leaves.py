from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Header, HTTPException, Path, Query
from pydantic import BaseModel, Field

from database.supabase_client import _bootstrap_backend_env, get_supabase_service
from dependencies.auth_dependency import get_auth_context
from services.audit_service import record_audit_event
from services.decision_token_service import make_decision_token, verify_decision_token
from services.email_service import render_email_template, send_email

import os

router = APIRouter()
logger = logging.getLogger(__name__)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _frontend_base() -> str:
    _bootstrap_backend_env()
    base = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    return base or "http://localhost:3000"


class LeaveCreateIn(BaseModel):
    from_date: str
    to_date: str
    reason: str = Field(..., min_length=1, max_length=2000)


class LeaveDecisionIn(BaseModel):
    token: str = Field(..., min_length=20)
    remarks: str = Field(..., min_length=1, max_length=2000)


def _list_recipients(kind: str) -> List[Dict[str, Any]]:
    return get_supabase_service().select(
        table="email_lists",
        select="id,email,name",
        where_eq={"kind": kind},
        order="created_at.desc",
        limit=500,
    )


@router.post("", response_model=Dict[str, Any])
def apply_leave(
    payload: LeaveCreateIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = get_auth_context(authorization=authorization)
    db = get_supabase_service()
    try:
        fd = datetime.fromisoformat(payload.from_date).date()
        td = datetime.fromisoformat(payload.to_date).date()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid date format") from exc
    if td < fd:
        raise HTTPException(status_code=400, detail="to_date must be after or equal to from_date")

    row = {
        "applicant_id": auth.user_id,
        "from_date": fd.isoformat(),
        "to_date": td.isoformat(),
        "reason": payload.reason.strip(),
        "status": "pending",
    }
    inserted = db.insert_many(table="leaves", rows=[row], return_representation=True)
    leave = inserted[0] if inserted else row
    leave_id = str(leave.get("id"))
    expiry = _now_utc() + timedelta(days=7)
    applicants = db.select(
        table="users",
        select="id,name,email",
        where_eq={"id": auth.user_id},
        limit=1,
    )
    applicant = applicants[0] if applicants else {"name": auth.name, "email": auth.email}
    applicant_name = str(applicant.get("name") or auth.name or "Applicant")
    applicant_email = str(applicant.get("email") or auth.email)

    approval_rows = _list_recipients("approval")
    notification_rows = _list_recipients("notification")

    try:
        for r in approval_rows:
            to_email = str(r.get("email") or "").strip().lower()
            if not to_email:
                continue
            approve_token = make_decision_token(leave_id=leave_id, email=to_email, action="approve")
            reject_token = make_decision_token(leave_id=leave_id, email=to_email, action="reject")
            db.insert_many(
                table="leave_decision_tokens",
                rows=[
                    {
                        "token": approve_token,
                        "leave_id": leave_id,
                        "recipient_email": to_email,
                        "action": "approve",
                        "expires_at": expiry.isoformat(),
                    },
                    {
                        "token": reject_token,
                        "leave_id": leave_id,
                        "recipient_email": to_email,
                        "action": "reject",
                        "expires_at": expiry.isoformat(),
                    },
                ],
                return_representation=False,
            )
            approve_q = urlencode({"action": "approve", "token": approve_token})
            reject_q = urlencode({"action": "reject", "token": reject_token})
            approve_url = f"{_frontend_base()}/leaves/{leave_id}/decide?{approve_q}"
            reject_url = f"{_frontend_base()}/leaves/{leave_id}/decide?{reject_q}"
            html = render_email_template(
                "leave_approval_request.html",
                {
                    "applicant_name": applicant_name,
                    "applicant_email": applicant_email,
                    "from_date": fd.isoformat(),
                    "to_date": td.isoformat(),
                    "reason": payload.reason.strip(),
                    "approve_url": approve_url,
                    "reject_url": reject_url,
                    "leave_id": leave_id,
                },
            )
            if not send_email(
                to_email,
                subject=f"Leave Approval Request — {applicant_name} ({fd.isoformat()} -> {td.isoformat()})",
                html=html,
                text=f"Leave request from {applicant_name}. Approve: {approve_url} Reject: {reject_url}",
            ):
                logger.warning(
                    "Leave apply: approval email not sent (Postmark not configured on API host or EMAIL_MODE=log only)."
                )

        for r in notification_rows:
            to_email = str(r.get("email") or "").strip().lower()
            if not to_email:
                continue
            html = render_email_template(
                "leave_notification.html",
                {
                    "applicant_name": applicant_name,
                    "applicant_email": applicant_email,
                    "from_date": fd.isoformat(),
                    "to_date": td.isoformat(),
                    "reason": payload.reason.strip(),
                },
            )
            if not send_email(
                to_email,
                subject=f"Leave Applied — {applicant_name} ({fd.isoformat()} -> {td.isoformat()})",
                html=html,
                text=f"FYI: Leave applied by {applicant_name} for {fd.isoformat()} to {td.isoformat()}",
            ):
                logger.warning(
                    "Leave apply: notification email not sent (Postmark not configured on API host or send skipped)."
                )
    except Exception as exc:
        logger.error(
            "Leave saved but email/token notify failed — check POSTMARK_SMTP_* and SMTP_FROM_EMAIL on API host: %s",
            exc,
            exc_info=True,
        )

    record_audit_event(
        db,
        actor_email=auth.email,
        action="leave_applied",
        target_id=leave_id,
        metadata={"from_date": fd.isoformat(), "to_date": td.isoformat()},
    )
    return leave


@router.get("", response_model=List[Dict[str, Any]])
def my_leaves(authorization: Optional[str] = Header(default=None)):
    auth = get_auth_context(authorization=authorization)
    return get_supabase_service().select(
        table="leaves",
        select="*",
        where_eq={"applicant_id": auth.user_id},
        order="created_at.desc",
        limit=200,
    )


@router.get("/{leave_id}/decide", response_model=Dict[str, Any])
def get_decision_preview(
    leave_id: str = Path(...),
    token: str = Query(..., min_length=20),
):
    db = get_supabase_service()
    try:
        payload = verify_decision_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if str(payload.get("leave_id")) != leave_id:
        raise HTTPException(status_code=400, detail="Token does not match leave id")
    token_row = db.select(
        table="leave_decision_tokens",
        select="token,leave_id,recipient_email,action,expires_at,consumed_at",
        where_eq={"token": token},
        limit=1,
    )
    if not token_row:
        raise HTTPException(status_code=404, detail="Decision token not found")
    trow = token_row[0]
    leave_rows = db.select(table="leaves", select="*", where_eq={"id": leave_id}, limit=1)
    if not leave_rows:
        raise HTTPException(status_code=404, detail="Leave not found")
    leave = leave_rows[0]
    return {
        "leave": leave,
        "action": trow.get("action"),
        "already_decided": str(leave.get("status") or "pending") != "pending" or bool(trow.get("consumed_at")),
    }


@router.post("/{leave_id}/decision", response_model=Dict[str, Any])
def decide_leave(
    payload: LeaveDecisionIn,
    leave_id: str = Path(...),
):
    db = get_supabase_service()
    try:
        token_payload = verify_decision_token(payload.token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if str(token_payload.get("leave_id")) != leave_id:
        raise HTTPException(status_code=400, detail="Token does not match leave id")
    token_rows = db.select(
        table="leave_decision_tokens",
        select="token,leave_id,recipient_email,action,expires_at,consumed_at",
        where_eq={"token": payload.token},
        limit=1,
    )
    if not token_rows:
        raise HTTPException(status_code=404, detail="Decision token not found")
    token_row = token_rows[0]
    if token_row.get("consumed_at"):
        raise HTTPException(status_code=400, detail="This decision link was already used")
    leave_rows = db.select(table="leaves", select="*", where_eq={"id": leave_id}, limit=1)
    if not leave_rows:
        raise HTTPException(status_code=404, detail="Leave not found")
    leave = leave_rows[0]
    if str(leave.get("status") or "pending") != "pending":
        raise HTTPException(status_code=400, detail="Leave already decided")

    action = str(token_row.get("action") or "")
    status_value = "approved" if action == "approve" else "rejected"
    decided_at = _now_utc().isoformat()
    updated_leave = db.update_single(
        table="leaves",
        payload={
            "status": status_value,
            "decided_by_email": token_row.get("recipient_email"),
            "decided_at": decided_at,
            "remarks": payload.remarks.strip(),
        },
        where_eq={"id": leave_id},
    )
    if not updated_leave:
        raise HTTPException(status_code=500, detail="Failed to update leave")

    db.update_single(
        table="leave_decision_tokens",
        payload={"consumed_at": decided_at},
        where_eq={"token": payload.token},
    )
    siblings = db.select(
        table="leave_decision_tokens",
        select="token",
        where_eq={"leave_id": leave_id},
    )
    for sib in siblings:
        tk = str(sib.get("token") or "")
        if tk and tk != payload.token:
            db.update_single(
                table="leave_decision_tokens",
                payload={"consumed_at": decided_at},
                where_eq={"token": tk},
            )

    applicant_rows = db.select(
        table="users",
        select="id,name,email",
        where_eq={"id": updated_leave["applicant_id"]},
        limit=1,
    )
    applicant = applicant_rows[0] if applicant_rows else {}
    applicant_email = str(applicant.get("email") or "")
    if applicant_email:
        html = render_email_template(
            "leave_decision_result.html",
            {
                "applicant_name": str(applicant.get("name") or "there"),
                "status": status_value,
                "from_date": str(updated_leave.get("from_date") or ""),
                "to_date": str(updated_leave.get("to_date") or ""),
                "reason": str(updated_leave.get("reason") or ""),
                "decided_by_email": str(updated_leave.get("decided_by_email") or ""),
                "remarks": payload.remarks.strip(),
            },
        )
        if not send_email(
            applicant_email,
            subject=f"Your leave was {status_value}",
            html=html,
            text=f"Your leave was {status_value}. Remarks: {payload.remarks.strip()}",
        ):
            logger.warning(
                "Leave decision: applicant email not sent (Postmark not configured on API host)."
            )

    record_audit_event(
        db,
        actor_email=str(updated_leave.get("decided_by_email") or ""),
        action="leave_decided",
        target_id=leave_id,
        metadata={"status": status_value},
    )
    return updated_leave

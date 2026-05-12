from __future__ import annotations

import logging
from datetime import date
from typing import Any, Dict, List, Optional
import os

from fastapi import APIRouter, Body, HTTPException, Path, Query, Header
from pydantic import BaseModel, Field

from database.supabase_client import _bootstrap_backend_env, get_supabase_service
from services.leave_balance_attendance_service import calculate_user_leave_balance
from services.leave_service import (
    create_leave_request,
    decide_leave_request_for_tenant,
    get_allocated_total_leave,
    get_employee_for_leave,
    list_leave_requests_for_tenant,
    list_leave_summary,
    update_leave_allocation,
)
from dependencies.auth_dependency import get_auth_context
from database.supabase_client import get_supabase_user
from services.auth_service import require_role
from services.email_service import render_email_template, send_email
from services.decision_token_service import make_decision_token, verify_decision_token

router = APIRouter()
logger = logging.getLogger(__name__)


def _frontend_base() -> str:
    _bootstrap_backend_env()
    base = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    return base or "http://localhost:3000"


def _safe_update_leave_request_decision(
    *,
    supabase,
    request_id: str,
    tenant_id: Optional[str],
    status_value: str,
    decided_by_email: str,
    remarks: str,
) -> Dict[str, Any]:
    base_where = {k: v for k, v in {"id": request_id, "tenant_id": tenant_id}.items() if v is not None}
    payload_full = {
        "status": status_value,
        "remarks": remarks,
        "decided_by_email": decided_by_email,
    }
    try:
        updated = supabase.update_single(
            table="leave_requests",
            payload=payload_full,
            where_eq=base_where,
        )
        if updated:
            return updated
    except Exception:
        pass
    # Backward-compatible schemas without remarks/decided_by_email columns.
    updated = supabase.update_single(
        table="leave_requests",
        payload={"status": status_value},
        where_eq=base_where,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Leave request not found")
    return updated


def _notify_leave_recipients(
    *,
    employee: Dict[str, Any],
    leave_row: Dict[str, Any],
    supabase,
) -> None:
    """
    Send leave request emails from legacy `/leave/requests` flow.
    Does not fail the request if email list table is missing/unmigrated or if SMTP fails.
    """
    try:
        approvals = supabase.select(
            table="email_lists",
            select="email,name",
            where_eq={"kind": "approval"},
            order="created_at.desc",
            limit=200,
        )
        notifications = supabase.select(
            table="email_lists",
            select="email,name",
            where_eq={"kind": "notification"},
            order="created_at.desc",
            limit=200,
        )
    except Exception:
        return

    applicant_name = str(employee.get("name") or employee.get("employee_code") or "Employee")
    applicant_email = str(employee.get("email") or "")
    from_date = str(leave_row.get("leave_date_start") or "")
    to_date = str(leave_row.get("leave_date_end") or "")
    reason = str(leave_row.get("reason") or "")
    leave_id = str(leave_row.get("id") or "")

    try:
        for row in approvals or []:
            to_email = str(row.get("email") or "").strip().lower()
            if not to_email:
                continue
            approve_token = make_decision_token(leave_id=leave_id, email=to_email, action="approve")
            reject_token = make_decision_token(leave_id=leave_id, email=to_email, action="reject")
            approve_url = f"{_frontend_base()}/leave/requests/{leave_id}/decide?action=approve&token={approve_token}"
            reject_url = f"{_frontend_base()}/leave/requests/{leave_id}/decide?action=reject&token={reject_token}"
            html = render_email_template(
                "leave_approval_request.html",
                {
                    "applicant_name": applicant_name,
                    "applicant_email": applicant_email,
                    "from_date": from_date,
                    "to_date": to_date,
                    "reason": reason,
                    "approve_url": approve_url,
                    "reject_url": reject_url,
                    "leave_id": leave_id,
                },
            )
            send_email(
                to_email,
                subject=f"Leave Approval Request — {applicant_name} ({from_date} -> {to_date})",
                html=html,
                text=f"Leave request for {applicant_name}: {from_date} -> {to_date}. Approve: {approve_url} Reject: {reject_url}",
            )

        for row in notifications or []:
            to_email = str(row.get("email") or "").strip().lower()
            if not to_email:
                continue
            html = render_email_template(
                "leave_notification.html",
                {
                    "applicant_name": applicant_name,
                    "applicant_email": applicant_email,
                    "from_date": from_date,
                    "to_date": to_date,
                    "reason": reason,
                },
            )
            send_email(
                to_email,
                subject=f"Leave Applied — {applicant_name} ({from_date} -> {to_date})",
                html=html,
                text=f"FYI: {applicant_name} applied leave for {from_date} -> {to_date}.",
            )
    except Exception as exc:
        logger.error(
            "Leave saved but notification email failed — set POSTMARK_* on the **API** host (not Vercel); "
            "use a live Postmark server token (sandbox does not inbox); verify POSTMARK_FROM_EMAIL sender: %s",
            exc,
            exc_info=True,
        )


class LeaveDecisionBody(BaseModel):
    not_deducted_days: float = Field(default=0, ge=0)


class LeaveAllocationBody(BaseModel):
    year: int = Field(default_factory=lambda: date.today().year, ge=2000, le=2100)
    total_leave: float = Field(..., ge=0)


class LeaveCreateBody(BaseModel):
    employee_id: str
    leave_type: str = Field(..., min_length=1, max_length=100)
    leave_date_start: date
    leave_date_end: date
    reason: str = Field(..., min_length=1, max_length=500)


class LeaveEmailDecisionBody(BaseModel):
    token: str = Field(..., min_length=20)
    remarks: str = Field(..., min_length=1, max_length=1000)


@router.get("/summary", response_model=List[Dict[str, Any]])
def summary(
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    return list_leave_summary(
        year=year,
        month=month,
        user_email=auth.email,
        role=auth.role,
        supabase=get_supabase_user(auth.access_token),
    )


@router.get("/balance/{employee_id}", response_model=Dict[str, Any])
def employee_leave_balance(
    employee_id: str,
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    supabase = get_supabase_user(auth.access_token)
    employee = get_employee_for_leave(employee_id, supabase)
    if not employee or not employee.get("id"):
        raise HTTPException(status_code=404, detail="Employee not found")
    emp_email = str(employee.get("email") or "").strip().lower()
    if auth.role not in {"master_admin", "admin"} and emp_email != auth.email.strip().lower():
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    try:
        bal_rows = supabase.select(
            table="leave_balances",
            select="*",
            where_eq={"employee_id": employee_id, "year": year},
            limit=1,
        )
    except Exception:
        bal_rows = []
    balance_row = bal_rows[0] if bal_rows else None
    total_leave = get_allocated_total_leave(employee, balance_row)
    return calculate_user_leave_balance(
        employee_id,
        month,
        year,
        total_leave,
        supabase,
    )


@router.post("/requests", response_model=Dict[str, Any])
def create_request(
    body: LeaveCreateBody,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    supabase = get_supabase_user(auth.access_token)
    employee = get_employee_for_leave(body.employee_id, supabase=supabase)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if auth.role not in {"master_admin", "admin"}:
        employee_email = str(employee.get("email") or "").strip().lower()
        if employee_email != auth.email.strip().lower():
            raise HTTPException(status_code=403, detail="You can only apply leave for your own employee profile")
    if body.leave_date_end < body.leave_date_start:
        raise HTTPException(status_code=400, detail="To date must be greater than or equal to From date")

    try:
        created = create_leave_request(
            employee=employee,
            leave_date_start=body.leave_date_start,
            leave_date_end=body.leave_date_end,
            leave_type=body.leave_type.strip(),
            reason=body.reason.strip(),
            supabase=supabase,
            tenant_id=auth.tenant_id,
        )
    except HTTPException:
        raise
    except Exception as e:
        low = str(e).lower()
        if "leave_requests" in low and ("pgrst205" in low or "schema cache" in low or "could not find" in low):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Leave request could not be saved: the `leave_requests` table or columns may be missing. "
                    "Run `backend/database/payroll_leave_update.sql` in the Supabase SQL editor, then retry."
                ),
            ) from e
        raise HTTPException(status_code=400, detail=f"Leave request could not be saved: {e}") from e

    _notify_leave_recipients(employee=employee, leave_row=created, supabase=supabase)
    return created


@router.patch("/balances/{employee_id}", response_model=Dict[str, Any])
def update_balance(
    employee_id: str,
    body: LeaveAllocationBody,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin")
    return update_leave_allocation(
        employee_id=employee_id,
        year=body.year,
        total_leave=body.total_leave,
        supabase=get_supabase_user(auth.access_token),
    )


@router.get("/requests", response_model=List[Dict[str, Any]])
def list_requests(
    status: Optional[str] = Query(default="pending"),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        return []

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    return list_leave_requests_for_tenant(
        status=status,
        tenant_id=auth.tenant_id,
        supabase=get_supabase_user(auth.access_token),
    )


@router.post("/requests/{request_id}/{decision}", response_model=Dict[str, Any])
def decide(
    request_id: str = Path(...),
    decision: str = Path(..., description="approved|rejected|unapproved"),
    body: LeaveDecisionBody = Body(default_factory=LeaveDecisionBody),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    try:
        return decide_leave_request_for_tenant(
            request_id=request_id,
            decision=decision,
            tenant_id=auth.tenant_id,
            supabase=get_supabase_user(auth.access_token),
            not_deducted_days=body.not_deducted_days,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Leave table unavailable in Phase 2 schema: {e}",
        ) from e


@router.get("/requests/{request_id}/decide", response_model=Dict[str, Any])
def preview_email_decision(
    request_id: str = Path(...),
    token: str = Query(..., min_length=20),
):
    supabase = get_supabase_service()
    try:
        payload = verify_decision_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if str(payload.get("leave_id") or "") != request_id:
        raise HTTPException(status_code=400, detail="Token does not match leave request id")
    rows = supabase.select(
        table="leave_requests",
        select="*",
        where_eq={"id": request_id},
        limit=1,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Leave request not found")
    leave = rows[0]
    already_decided = str(leave.get("status") or "").lower() in {"approved", "rejected", "unapproved"}
    return {
        "request": leave,
        "action": payload.get("action"),
        "already_decided": already_decided,
    }


@router.post("/requests/{request_id}/decision", response_model=Dict[str, Any])
def submit_email_decision(
    body: LeaveEmailDecisionBody,
    request_id: str = Path(...),
):
    supabase = get_supabase_service()
    try:
        payload = verify_decision_token(body.token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if str(payload.get("leave_id") or "") != request_id:
        raise HTTPException(status_code=400, detail="Token does not match leave request id")

    rows = supabase.select(
        table="leave_requests",
        select="*",
        where_eq={"id": request_id},
        limit=1,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Leave request not found")
    current = rows[0]
    if str(current.get("status") or "").lower() in {"approved", "rejected", "unapproved"}:
        raise HTTPException(status_code=400, detail="Leave request already decided")

    action = str(payload.get("action") or "").strip().lower()
    status_value = "approved" if action == "approve" else "rejected"
    updated = _safe_update_leave_request_decision(
        supabase=supabase,
        request_id=request_id,
        tenant_id=str(current.get("tenant_id") or "") or None,
        status_value=status_value,
        decided_by_email=str(payload.get("email") or ""),
        remarks=body.remarks.strip(),
    )
    return {
        "ok": True,
        "message": f"Leave {status_value}.",
        "request": updated,
    }


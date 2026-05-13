from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from fastapi import APIRouter, Body, HTTPException, Header, Path, Query
from pydantic import BaseModel, Field

from database.supabase_client import _bootstrap_backend_env, get_supabase_service, get_supabase_user
from dependencies.auth_dependency import get_auth_context
from services.auth_service import require_role
from services.decision_token_service import make_decision_token, verify_decision_token
from services.email_service import (
    email_delivery_mode,
    postmark_token_configured,
    render_email_template,
    send_email,
)
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

router = APIRouter()
logger = logging.getLogger(__name__)


def _frontend_base() -> str:
    """
    Public URLs for email buttons. Prefer FRONTEND_URL; never silently fall back to localhost in production.
    """
    _bootstrap_backend_env()
    base = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    if base:
        return base
    for raw in os.getenv("CORS_ORIGINS", "").split(","):
        origin = raw.strip().rstrip("/")
        if not origin:
            continue
        low = origin.lower()
        if "localhost" in low or "127.0.0.1" in low:
            continue
        return origin
    dev = os.getenv("API_ENV", "").strip().lower() in {"", "dev", "development", "local"}
    if not dev:
        logger.warning(
            "FRONTEND_URL is not set; email links will use http://localhost:3000. "
            "Set FRONTEND_URL on the API host (e.g. https://industryprime-attendance.vercel.app)."
        )
    return "http://localhost:3000"


def _safe_update_leave_request_decision(
    *,
    supabase,
    request_id: str,
    tenant_id: Optional[str],
    status_value: str,
    decided_by_email: str,
    remarks: str,
    rejection_remarks: str,
    token_jti: Optional[str],
) -> Dict[str, Any]:
    now_iso = datetime.now(timezone.utc).isoformat()

    base_pending: Dict[str, Any] = {"id": request_id, "status": "pending"}
    if tenant_id:
        base_pending["tenant_id"] = tenant_id

    def _rich_payload() -> Dict[str, Any]:
        out: Dict[str, Any] = {
            "status": status_value,
            "remarks": remarks,
            "decided_by_email": decided_by_email,
        }
        if token_jti:
            out["email_decision_jti"] = token_jti
            out["decision_token_used"] = True
        if status_value == "approved":
            out["approved_by"] = decided_by_email
            out["approved_at"] = now_iso
        else:
            out["rejected_by"] = decided_by_email
            out["rejected_at"] = now_iso
            out["rejection_remarks"] = rejection_remarks
        return out

    attempts: List[tuple[Dict[str, Any], Optional[List[str]]]] = []
    rich = _rich_payload()
    if token_jti:
        attempts.append((rich, ["email_decision_jti"]))
    attempts.append((rich, None))

    slim: Dict[str, Any] = {"status": status_value, "remarks": remarks, "decided_by_email": decided_by_email}
    attempts.append((slim, None))
    attempts.append(({"status": status_value}, None))

    last_err: Optional[Exception] = None
    for payload, wnull in attempts:
        clean = {k: v for k, v in payload.items() if v is not None}
        try:
            updated = supabase.update_single(
                table="leave_requests",
                payload=clean,
                where_eq=base_pending,
                where_is_null=wnull,
            )
            if updated:
                return updated
        except Exception as exc:
            last_err = exc
            continue

    rows = supabase.select(table="leave_requests", select="id,status", where_eq={"id": request_id}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Leave request not found")
    st = str(rows[0].get("status") or "").lower()
    if st != "pending":
        raise HTTPException(status_code=400, detail="Leave request already decided")
    if last_err:
        raise HTTPException(status_code=400, detail=f"Could not update leave request: {last_err}") from last_err
    raise HTTPException(status_code=409, detail="Could not apply decision. Please try again.")


def _preview_leave_email_decision(*, request_id: str, token: str) -> Dict[str, Any]:
    supabase = get_supabase_service()
    try:
        payload = verify_decision_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if str(payload.get("leave_id") or "") != request_id:
        raise HTTPException(status_code=400, detail="Token does not match leave request id")
    rows = supabase.select(table="leave_requests", select="*", where_eq={"id": request_id}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Leave request not found")
    leave = rows[0]
    already_decided = str(leave.get("status") or "").lower() in {"approved", "rejected", "unapproved"}
    return {
        "request": leave,
        "action": payload.get("action"),
        "already_decided": already_decided,
    }


def _notify_applicant_leave_decision(
    *,
    leave_row: Dict[str, Any],
    status_value: str,
    decided_by_email: str,
    remarks: str,
    rejection_remarks: str,
) -> None:
    emp_id = str(leave_row.get("employee_id") or "").strip()
    if not emp_id:
        return
    supabase = get_supabase_service()
    employee = get_employee_for_leave(emp_id, supabase)
    to_email = str(employee.get("email") or "").strip().lower()
    if not to_email:
        return
    applicant_name = str(employee.get("name") or employee.get("employee_code") or "Employee")
    from_date = str(leave_row.get("leave_date_start") or "")
    to_date = str(leave_row.get("leave_date_end") or "")
    reason = str(leave_row.get("reason") or "")
    display_remarks = rejection_remarks.strip() if status_value == "rejected" else remarks.strip()
    status_word = "approved" if status_value == "approved" else "rejected"
    subject = f"Your leave was {status_word.title()} — {from_date} to {to_date}"
    html = render_email_template(
        "leave_decision_result.html",
        {
            "status": status_word,
            "from_date": from_date,
            "to_date": to_date,
            "decided_by_email": decided_by_email,
            "reason": reason,
            "remarks": display_remarks or "—",
            "applicant_name": applicant_name,
        },
    )
    try:
        send_email(
            to_email,
            subject=subject,
            html=html,
            text=f"Hi {applicant_name}, your leave ({from_date} -> {to_date}) was {status_word}. Remarks: {display_remarks or '—'}",
        )
    except Exception as exc:
        logger.error("Applicant leave decision email failed: %s", exc, exc_info=True)


def _process_leave_email_decision(
    *,
    token: str,
    remarks: Optional[str],
    request_id_path: Optional[str],
    expected_action: Optional[str],
) -> Dict[str, Any]:
    supabase = get_supabase_service()
    try:
        payload = verify_decision_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    action = str(payload.get("action") or "").strip().lower()
    if expected_action and action != expected_action:
        raise HTTPException(status_code=400, detail="This link does not match the requested action")

    request_id = str(payload.get("leave_id") or "").strip()
    if not request_id:
        raise HTTPException(status_code=400, detail="Invalid decision token")
    if request_id_path and request_id_path != request_id:
        raise HTTPException(status_code=400, detail="Token does not match leave request id")

    rows = supabase.select(table="leave_requests", select="*", where_eq={"id": request_id}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Leave request not found")
    current = rows[0]
    cur_status = str(current.get("status") or "").lower()
    if cur_status in {"approved", "rejected", "unapproved"}:
        raise HTTPException(status_code=400, detail="Leave request already decided")

    token_jti = str(payload.get("jti") or "").strip() or None

    decided_by_email = str(payload.get("email") or "").strip()
    if action == "approve":
        general = (remarks or "").strip() or "Approved via email link."
        rejection_remarks = ""
        status_value = "approved"
    else:
        general = (remarks or "").strip()
        if not general:
            raise HTTPException(status_code=400, detail="Rejection remarks are required.")
        rejection_remarks = general
        status_value = "rejected"

    tenant_id = str(current.get("tenant_id") or "").strip() or None
    updated = _safe_update_leave_request_decision(
        supabase=supabase,
        request_id=request_id,
        tenant_id=tenant_id,
        status_value=status_value,
        decided_by_email=decided_by_email,
        remarks=general,
        rejection_remarks=rejection_remarks,
        token_jti=token_jti,
    )
    _notify_applicant_leave_decision(
        leave_row=updated,
        status_value=status_value,
        decided_by_email=decided_by_email,
        remarks=general,
        rejection_remarks=rejection_remarks,
    )
    return {
        "ok": True,
        "message": "Leave approved successfully." if status_value == "approved" else "Leave rejected.",
        "request": updated,
    }


def _notify_leave_recipients(
    *,
    employee: Dict[str, Any],
    leave_row: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Send leave request emails from legacy `/leave/requests` flow.
    Uses the service-role Supabase client for `email_lists` so RLS on that table
    does not hide recipients when the caller is a normal user JWT.
    Does not fail the request if email list table is missing/unmigrated or if SMTP fails.
    Returns a small summary for the API response (check `email_notify` in production).
    """
    summary: Dict[str, Any] = {
        "loaded_lists": False,
        "approval_list_count": 0,
        "notification_list_count": 0,
        "emails_sent_approval": 0,
        "emails_sent_notification": 0,
        "error": None,
        "delivery_mode": email_delivery_mode(),
        "delivery_note": None,
    }
    db_lists = get_supabase_service()
    try:
        approvals = db_lists.select(
            table="email_lists",
            select="email,name",
            where_eq={"kind": "approval"},
            order="created_at.desc",
            limit=200,
        )
        notifications = db_lists.select(
            table="email_lists",
            select="email,name",
            where_eq={"kind": "notification"},
            order="created_at.desc",
            limit=200,
        )
        summary["loaded_lists"] = True
        summary["approval_list_count"] = len(approvals or [])
        summary["notification_list_count"] = len(notifications or [])
    except Exception as exc:
        summary["error"] = f"email_lists_query_failed: {exc}"
        logger.error(
            "Leave notify: could not read public.email_lists with service role "
            "(check SUPABASE_SERVICE_ROLE_KEY on the API host and table exists): %s",
            exc,
            exc_info=True,
        )
        return summary

    applicant_name = str(employee.get("name") or employee.get("employee_code") or "Employee")
    applicant_email = str(employee.get("email") or "")
    from_date = str(leave_row.get("leave_date_start") or "")
    to_date = str(leave_row.get("leave_date_end") or "")
    reason = str(leave_row.get("reason") or "")
    leave_id = str(leave_row.get("id") or "").strip()
    if not leave_id:
        summary["error"] = "leave_row_missing_id_cannot_build_approval_links"
        logger.error(
            "Leave notify skipped: inserted leave row has no id (cannot send approval links). row_keys=%s",
            list(leave_row.keys()) if isinstance(leave_row, dict) else type(leave_row),
        )
        return summary

    if summary["approval_list_count"] == 0 and summary["notification_list_count"] == 0:
        logger.warning(
            "Leave notify: email_lists has no approval or notification rows; no emails sent. "
            "Add rows in Settings → Email lists or run SQL against public.email_lists."
        )

    planned_sends = 0
    for row in approvals or []:
        if str(row.get("email") or "").strip():
            planned_sends += 1
    for row in notifications or []:
        if str(row.get("email") or "").strip():
            planned_sends += 1

    base = _frontend_base()
    try:
        for row in approvals or []:
            to_email = str(row.get("email") or "").strip().lower()
            if not to_email:
                continue
            approve_token = make_decision_token(leave_id=leave_id, email=to_email, action="approve")
            reject_token = make_decision_token(leave_id=leave_id, email=to_email, action="reject")
            approve_url = f"{base}/leave/decision?leave_id={quote(leave_id, safe='')}&token={quote(approve_token, safe='')}&action=approve"
            reject_url = f"{base}/leave/reject?leave_id={quote(leave_id, safe='')}&token={quote(reject_token, safe='')}"
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
            if send_email(
                to_email,
                subject=f"Leave Approval Request — {applicant_name} ({from_date} -> {to_date})",
                html=html,
                text=f"Leave request for {applicant_name}: {from_date} -> {to_date}. Approve: {approve_url} Reject: {reject_url}",
            ):
                summary["emails_sent_approval"] += 1

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
            if send_email(
                to_email,
                subject=f"Leave Applied — {applicant_name} ({from_date} -> {to_date})",
                html=html,
                text=f"FYI: {applicant_name} applied leave for {from_date} -> {to_date}.",
            ):
                summary["emails_sent_notification"] += 1

        sent_total = summary["emails_sent_approval"] + summary["emails_sent_notification"]
        if (
            planned_sends > 0
            and sent_total == 0
            and email_delivery_mode() == "postmark"
            and not postmark_token_configured()
        ):
            summary["delivery_note"] = (
                "No emails were delivered: Postmark SMTP credentials missing on the API server. "
                "Set POSTMARK_SMTP_USERNAME, POSTMARK_SMTP_TOKEN, POSTMARK_SMTP_HOST, POSTMARK_SMTP_PORT, "
                "and SMTP_FROM_EMAIL where FastAPI runs (e.g. Render), redeploy, or set EMAIL_MODE=log."
            )
    except Exception as exc:
        summary["error"] = f"send_failed: {exc}"
        logger.error(
            "Leave saved but notification email failed — check POSTMARK_SMTP_* and SMTP_FROM_EMAIL on the API host: %s",
            exc,
            exc_info=True,
        )

    return summary


def _enrich_leave_requests_with_employee(supabase, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    try:
        employees = supabase.select(
            table="employees",
            select="id,name,email,employee_code",
            where_eq=None,
            order="name.asc",
        )
    except Exception:
        employees = []
    by_id = {str(e.get("id")): e for e in employees or []}
    for r in rows:
        emp = by_id.get(str(r.get("employee_id") or ""), {})
        r["employee_name"] = emp.get("name")
        r["employee_email"] = emp.get("email")
        r["employee_code"] = r.get("employee_code") or emp.get("employee_code")
    return rows


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
    remarks: Optional[str] = Field(default=None, max_length=2000)


class LeaveEmailApproveBody(BaseModel):
    token: str = Field(..., min_length=20)
    remarks: Optional[str] = Field(default=None, max_length=2000)


class LeaveEmailRejectBody(BaseModel):
    token: str = Field(..., min_length=20)
    remarks: str = Field(..., min_length=1, max_length=2000)


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

    notify_meta = _notify_leave_recipients(employee=employee, leave_row=created)
    if isinstance(created, dict):
        return {**created, "email_notify": notify_meta}
    return {"leave": created, "email_notify": notify_meta}


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
    employee_id: Optional[str] = Query(default=None),
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        return []

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    supabase = get_supabase_user(auth.access_token)
    rows = list_leave_requests_for_tenant(
        status=status,
        tenant_id=auth.tenant_id,
        supabase=supabase,
        employee_id=employee_id,
        year=year,
        month=month,
    )
    return _enrich_leave_requests_with_employee(supabase, rows)


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


@router.get("/decision-preview", response_model=Dict[str, Any])
def preview_decision_query(
    leave_id: str = Query(..., min_length=1),
    token: str = Query(..., min_length=20),
):
    return _preview_leave_email_decision(request_id=leave_id, token=token)


@router.get("/requests/{request_id}/decide", response_model=Dict[str, Any])
def preview_email_decision(
    request_id: str = Path(...),
    token: str = Query(..., min_length=20),
):
    return _preview_leave_email_decision(request_id=request_id, token=token)


@router.post("/approve", response_model=Dict[str, Any])
def approve_by_email(body: LeaveEmailApproveBody):
    return _process_leave_email_decision(
        token=body.token,
        remarks=body.remarks,
        request_id_path=None,
        expected_action="approve",
    )


@router.post("/reject", response_model=Dict[str, Any])
def reject_by_email(body: LeaveEmailRejectBody):
    return _process_leave_email_decision(
        token=body.token,
        remarks=body.remarks,
        request_id_path=None,
        expected_action="reject",
    )


@router.post("/requests/{request_id}/decision", response_model=Dict[str, Any])
def submit_email_decision(
    body: LeaveEmailDecisionBody,
    request_id: str = Path(...),
):
    return _process_leave_email_decision(
        token=body.token,
        remarks=body.remarks,
        request_id_path=request_id,
        expected_action=None,
    )

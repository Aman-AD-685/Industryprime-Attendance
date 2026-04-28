from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException, Path, Query, Header
from pydantic import BaseModel, Field

from services.leave_service import (
    create_leave_request,
    decide_leave_request_for_tenant,
    get_employee_for_leave,
    list_leave_requests_for_tenant,
    list_leave_summary,
    update_leave_allocation,
)
from dependencies.auth_dependency import get_auth_context
from database.supabase_client import get_supabase_user
from services.auth_service import require_role

router = APIRouter()


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


@router.get("/summary", response_model=List[Dict[str, Any]])
def summary(
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    return list_leave_summary(
        year=year,
        user_email=auth.email,
        role=auth.role,
        supabase=get_supabase_user(auth.access_token),
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
        return create_leave_request(
            employee=employee,
            leave_date_start=body.leave_date_start,
            leave_date_end=body.leave_date_end,
            leave_type=body.leave_type.strip(),
            reason=body.reason.strip(),
            supabase=supabase,
        )
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Leave request could not be saved. Run backend/database/payroll_leave_update.sql in Supabase. {e}",
        ) from e


@router.patch("/balances/{employee_id}", response_model=Dict[str, Any])
def update_balance(
    employee_id: str,
    body: LeaveAllocationBody,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
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


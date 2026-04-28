from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Header, HTTPException, Query
from pydantic import BaseModel, Field

from services.payroll_service import generate_payroll, summarize_payroll
from dependencies.auth_dependency import get_auth_context
from database.supabase_client import get_supabase_user
from services.auth_service import require_role

router = APIRouter()


class PayrollGenerateRequest(BaseModel):
    period_start: date = Field(..., description="Payroll period start date")
    period_end: date = Field(..., description="Payroll period end date")


@router.get("/summary", response_model=Dict[str, Any])
def payroll_summary(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    return summarize_payroll(
        month=month,
        year=year,
        user_email=auth.email,
        role=auth.role,
        supabase=get_supabase_user(auth.access_token),
    )


@router.post("/generate", response_model=Dict[str, Any])
def payroll_generate(
    payload: PayrollGenerateRequest = Body(...),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        return {
            "payroll_run": {
                "id": "mock",
                "period_start": str(payload.period_start),
                "period_end": str(payload.period_end),
                "status": "pending",
            },
            "items": [],
        }

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    return generate_payroll(
        payload.period_start,
        payload.period_end,
        tenant_id=auth.tenant_id,
        supabase=get_supabase_user(auth.access_token),
    )


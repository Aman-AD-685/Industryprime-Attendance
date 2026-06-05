from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Header, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from services.payroll_service import generate_payroll, summarize_payroll
from services.payslip_pdf_service import build_payslip_pdf_bytes
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


@router.get("/payslip-pdf")
def payroll_payslip_pdf(
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    employee_id: str = Query(..., min_length=1),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    supabase = get_supabase_user(auth.access_token)
    data = summarize_payroll(
        month=month,
        year=year,
        user_email=auth.email,
        role=auth.role,
        supabase=supabase,
    )
    item = next((row for row in data.get("items") or [] if str(row.get("employee", {}).get("id")) == employee_id), None)
    if not item:
        raise HTTPException(status_code=404, detail="Payslip not found for this employee and month")

    emp = dict(item.get("employee") or {})
    pdf_bytes = build_payslip_pdf_bytes(
        emp,
        month=int(item["month"]),
        year=int(item["year"]),
        calendar_days=int(item["total_days"]),
        present_days=int(item["total_days_present"]),
        absent_attendance_days=int(item.get("total_days_absent") or item.get("attendance_absent_days") or 0),
        weekoff_days=int(item.get("weekoff_days") or 0),
        holiday_days=int(item.get("holiday_days") or 0),
        salary_eligible_days=float(item.get("salary_eligible_days") or 0),
        monthly_salary=float(emp.get("salary_monthly") or 0),
        leave_covered_days=float(item.get("leave_covered_days") or item.get("leave", {}).get("leave_covered_days") or 0),
        lop_days=float(item.get("lop_days") or item.get("leave", {}).get("lop_days") or 0),
    )
    code = str(emp.get("employee_code") or "employee").replace(" ", "_")
    fname = f"payslip-{code}-{year}-{month:02d}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
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


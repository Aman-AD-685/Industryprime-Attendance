from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query

from database.supabase_client import get_supabase_user
from dependencies.auth_dependency import get_auth_context
from schemas.attendance import AttendanceMonthOut, AttendanceUpdateIn, EmployeeAttendanceRowOut
from services.attendance_management_service import ensure_month, update_attendance
from services.auth_service import require_role

router = APIRouter()


def _auth_admin(authorization: Optional[str]):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    return auth


def _auth_employee_access(employee_id: str, authorization: Optional[str]):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    if auth.role in {"master_admin", "admin"}:
        return auth
    rows = get_supabase_user(auth.access_token).select(
        table="employees",
        select="id,email",
        where_eq={"id": employee_id},
        limit=1,
    )
    employee = rows[0] if rows else {}
    if str(employee.get("email") or "").strip().lower() != auth.email.strip().lower():
        raise HTTPException(status_code=403, detail="You can only view your own attendance")
    return auth


@router.get("/{employee_id}", response_model=AttendanceMonthOut)
def get_employee_attendance(
    employee_id: str,
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    authorization: Optional[str] = Header(default=None),
):
    if employee_id in {"upload", "report", "update", "months"}:
        raise HTTPException(status_code=404, detail="Attendance upload/report routes were removed. Use /attendance.")
    auth = _auth_employee_access(employee_id, authorization)
    rows = ensure_month(
        employee_id=employee_id,
        month=month,
        year=year,
        supabase=get_supabase_user(auth.access_token),
    )
    return {"employee_id": employee_id, "month": month, "year": year, "rows": rows}


@router.post("/update", response_model=EmployeeAttendanceRowOut)
def update_employee_attendance(
    payload: AttendanceUpdateIn,
    authorization: Optional[str] = Header(default=None),
):
    auth = _auth_admin(authorization)
    return update_attendance(
        payload.model_dump(),
        supabase=get_supabase_user(auth.access_token),
    )

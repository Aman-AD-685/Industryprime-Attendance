from __future__ import annotations

from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException, Query

from database.supabase_client import get_supabase, get_supabase_user
from dependencies.auth_dependency import AuthContext, get_auth_context
from schemas.attendance import AttendanceMonthOut, AttendanceUpdateIn, EmployeeAttendanceRowOut
from schemas.attendance_link import (
    AttendanceAddIn,
    AttendanceAddOut,
    AttendanceEntryEmployeeOut,
    AttendanceEntryMonthRowOut,
)
from services.attendance_link_entry_service import add_attendance_entry, list_entry_employees, list_entry_month
from services.attendance_management_service import ensure_month, update_attendance

router = APIRouter()


def _assert_can_update_attendance(employee_id: str, auth: AuthContext) -> None:
    """Admins may edit anyone; other roles may only edit rows for their own employee record (by email)."""
    if auth.role in {"master_admin", "admin"}:
        return
    rows = get_supabase().select(
        table="employees",
        select="email",
        where_eq={"id": employee_id},
        limit=1,
    )
    emp = rows[0] if rows else {}
    if str(emp.get("email") or "").strip().lower() != auth.email.strip().lower():
        raise HTTPException(
            status_code=403,
            detail="You can only edit your own attendance. Ask an admin to change other employees.",
        )


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


# --- Public attendance entry (no JWT; optional ATTENDANCE_ENTRY_SECRET via ?key=) ---


@router.post("/add", response_model=AttendanceAddOut)
def post_public_attendance_add(body: AttendanceAddIn):
    """Public form: add one row per user+date into `attendance_link_entries`."""
    row = add_attendance_entry(body.model_dump(), supabase=get_supabase())
    return AttendanceAddOut(**row)


@router.get("/entry/employees", response_model=List[AttendanceEntryEmployeeOut])
def get_public_entry_employees(key: Optional[str] = Query(default=None)):
    """Minimal employee list for public attendance dropdown."""
    rows = list_entry_employees(get_supabase(), key=key)
    return [AttendanceEntryEmployeeOut(**r) for r in rows]


@router.get("/entry/month", response_model=List[AttendanceEntryMonthRowOut])
def get_public_entry_month(
    user_id: str = Query(..., description="employees.id"),
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    key: Optional[str] = Query(default=None),
):
    rows = list_entry_month(user_id, month, year, key, supabase=get_supabase())
    return [AttendanceEntryMonthRowOut(**r) for r in rows]


@router.get("/{employee_id}", response_model=AttendanceMonthOut)
def get_employee_attendance(
    employee_id: str,
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    authorization: Optional[str] = Header(default=None),
):
    if employee_id in {"upload", "report", "update", "months", "add", "entry"}:
        raise HTTPException(status_code=404, detail="Attendance upload/report routes were removed. Use /attendance.")
    auth = _auth_employee_access(employee_id, authorization)
    rows, holidays = ensure_month(
        employee_id=employee_id,
        month=month,
        year=year,
        supabase=get_supabase_user(auth.access_token),
    )
    return {
        "employee_id": employee_id,
        "month": month,
        "year": year,
        "rows": rows,
        "holidays": holidays,
    }


@router.post("/update", response_model=EmployeeAttendanceRowOut)
def update_employee_attendance(
    payload: AttendanceUpdateIn,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    _assert_can_update_attendance(str(payload.employee_id), auth)
    return update_attendance(
        payload.model_dump(),
        supabase=get_supabase_user(auth.access_token),
    )

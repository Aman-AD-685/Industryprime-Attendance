from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Query

from dependencies.auth_dependency import get_auth_context
from database.supabase_client import get_supabase_user
from schemas.employees import EmployeeCreate, EmployeeOut, EmployeeUpdate
from services.employees_service import create_employee, list_employees, update_employee
from services.auth_service import require_role

router = APIRouter()


@router.get("", response_model=List[EmployeeOut])
def get_employees(
    status: Optional[str] = Query(default="active"),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        return []

    auth = get_auth_context(authorization=authorization)
    rows = list_employees(
        status=status,
        tenant_id=auth.tenant_id,
        supabase=get_supabase_user(auth.access_token),
    )
    if auth.role not in {"master_admin", "admin"}:
        rows = [row for row in rows if str(row.get("email") or "").strip().lower() == auth.email.strip().lower()]
    return [EmployeeOut(**{**r, "id": str(r.get("id", ""))}) for r in rows]


@router.post("", response_model=EmployeeOut)
def post_employee(
    body: EmployeeCreate,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    row = create_employee(
        {
            "name": body.name.strip(),
            "at_div_code": body.at_div_code.strip(),
            "email": (body.email.strip() if body.email else None),
            "department": body.department,
            "designation": body.designation,
            "salary_monthly": body.salary_monthly,
        },
        supabase=get_supabase_user(auth.access_token),
    )
    if not row.get("id"):
        raise HTTPException(status_code=400, detail="Failed to create employee")
    return EmployeeOut(**{**row, "id": str(row["id"])})


@router.patch("/{employee_id}", response_model=EmployeeOut)
def patch_employee(
    employee_id: str,
    body: EmployeeUpdate,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    row = update_employee(
        employee_id,
        {
            "name": body.name.strip(),
            "at_div_code": body.at_div_code.strip(),
            "email": (body.email.strip() if body.email else None),
            "department": body.department,
            "designation": body.designation,
            "salary_monthly": body.salary_monthly,
        },
        supabase=get_supabase_user(auth.access_token),
    )
    if not row.get("id"):
        raise HTTPException(status_code=404, detail="Employee not found")
    return EmployeeOut(**{**row, "id": str(row["id"])})


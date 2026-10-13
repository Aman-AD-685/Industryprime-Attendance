from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Header, HTTPException, Query

from dependencies.auth_dependency import get_auth_context
from database.supabase_client import get_supabase_user
from schemas.employees import (
    EmployeeAllowancesSelfUpdate,
    EmployeeCreate,
    EmployeeEmploymentStatusUpdate,
    EmployeeOut,
    EmployeeUpdate,
)
from services.employee_employment import employment_status_patch_payload, filter_employees_for_month
from services.employee_salary_history_service import (
    enrich_employees_with_salary_meta,
    record_initial_salary,
    record_salary_change,
)
from services.employees_service import create_employee, list_employees, update_employee
from services.hr_employees import fetch_leave_balances_for_year
from services.leave_service import get_allocated_total_leave, update_leave_allocation
from services.auth_service import require_role

router = APIRouter()


def _enrich_employees(supabase, rows: list[dict]) -> list[dict]:
    """Salary meta + current-year CL + SL allotment (leave_balances.total_leave), fetched together."""
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_meta = pool.submit(enrich_employees_with_salary_meta, supabase, rows)
        fut_bal = pool.submit(fetch_leave_balances_for_year, supabase, date.today().year)
        enriched = fut_meta.result()
        balances = {str(b.get("employee_id")): b for b in fut_bal.result()}
    for row in enriched:
        row["total_leave"] = get_allocated_total_leave(row, balances.get(str(row.get("id"))))
    return enriched


def _save_total_leave(supabase, employee_id: str, total_leave: Optional[float]) -> None:
    if total_leave is not None:
        update_leave_allocation(employee_id, date.today().year, float(total_leave), supabase)


def _default_effective_period() -> tuple[int, int]:
    today = date.today()
    return today.year, today.month


def _salary_changed(old: object, new: object) -> bool:
    if new is None:
        return False
    if old is None:
        return True
    try:
        return round(float(old), 2) != round(float(new), 2)
    except (TypeError, ValueError):
        return True


def _employee_out(supabase, row: dict) -> EmployeeOut:
    enriched = _enrich_employees(supabase, [row])[0]
    return EmployeeOut(**{**enriched, "id": str(enriched.get("id", ""))})


@router.get("", response_model=List[EmployeeOut])
def get_employees(
    status: Optional[str] = Query(default="active"),
    for_month: Optional[int] = Query(default=None, ge=1, le=12),
    for_year: Optional[int] = Query(default=None, ge=2000, le=2100),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        return []

    auth = get_auth_context(authorization=authorization)
    supabase = get_supabase_user(auth.access_token)
    rows = list_employees(
        status=status,
        tenant_id=auth.tenant_id,
        supabase=supabase,
    )
    if auth.role not in {"master_admin", "admin"}:
        rows = [row for row in rows if str(row.get("email") or "").strip().lower() == auth.email.strip().lower()]
    if for_month is not None and for_year is not None:
        rows = filter_employees_for_month(rows, for_month, for_year)
    enriched = _enrich_employees(supabase, rows)
    return [EmployeeOut(**{**r, "id": str(r.get("id", ""))}) for r in enriched]


@router.patch("/{employee_id}/employment-status", response_model=EmployeeOut)
def patch_employee_employment_status(
    employee_id: str,
    body: EmployeeEmploymentStatusUpdate,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    supabase = get_supabase_user(auth.access_token)
    payload = employment_status_patch_payload(body.employment_status)
    row = update_employee(employee_id, payload, supabase=supabase)
    if not row.get("id"):
        raise HTTPException(status_code=404, detail="Employee not found")
    return _employee_out(supabase, row)


@router.post("", response_model=EmployeeOut)
def post_employee(
    body: EmployeeCreate,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin", "admin")
    supabase = get_supabase_user(auth.access_token)
    row = create_employee(
        {
            "name": body.name.strip(),
            "at_div_code": body.at_div_code.strip(),
            "email": (body.email.strip() if body.email else None),
            "department": body.department,
            "designation": body.designation,
            "salary_monthly": body.salary_monthly,
            "professional_tax": body.professional_tax,
            "pf_employee_monthly": body.pf_employee_monthly,
            "income_tax_tds_monthly": body.income_tax_tds_monthly,
            "hra_monthly": body.hra_monthly,
            "conveyance_monthly": body.conveyance_monthly,
            "special_allowance_monthly": body.special_allowance_monthly,
            "joining_date": body.joining_date.isoformat() if body.joining_date else None,
        },
        supabase=supabase,
    )
    if not row.get("id"):
        raise HTTPException(status_code=400, detail="Failed to create employee")
    if body.salary_monthly is not None:
        eff_y = body.salary_effective_year
        eff_m = body.salary_effective_month
        if eff_y is None or eff_m is None:
            eff_y, eff_m = _default_effective_period()
        record_initial_salary(
            supabase,
            employee_id=str(row["id"]),
            salary_monthly=float(body.salary_monthly),
            effective_year=int(eff_y),
            effective_month=int(eff_m),
        )
    _save_total_leave(supabase, str(row["id"]), body.total_leave)
    return _employee_out(supabase, row)


@router.patch("/{employee_id}/allowances", response_model=EmployeeOut)
def patch_employee_allowances(
    employee_id: str,
    body: EmployeeAllowancesSelfUpdate,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    supabase = get_supabase_user(auth.access_token)
    rows = supabase.select(table="employees", select="*", where_eq={"id": employee_id}, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Employee not found")
    emp = rows[0]
    emp_email = str(emp.get("email") or "").strip().lower()
    is_admin = auth.role in {"master_admin", "admin"}
    if not is_admin and emp_email != auth.email.strip().lower():
        raise HTTPException(status_code=403, detail="You can only update your own pay components")

    payload = body.model_dump(exclude_unset=True)
    for key in list(payload.keys()):
        if key not in {"hra_monthly", "conveyance_monthly", "special_allowance_monthly"}:
            del payload[key]
    if not payload:
        raise HTTPException(status_code=400, detail="No allowed fields to update")

    row = update_employee(employee_id, payload, supabase=supabase)
    if not row.get("id"):
        raise HTTPException(status_code=404, detail="Employee not found")
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
    supabase = get_supabase_user(auth.access_token)
    existing_rows = supabase.select(table="employees", select="*", where_eq={"id": employee_id}, limit=1)
    if not existing_rows:
        raise HTTPException(status_code=404, detail="Employee not found")
    existing = existing_rows[0]

    if _salary_changed(existing.get("salary_monthly"), body.salary_monthly):
        if body.salary_effective_month is None or body.salary_effective_year is None:
            raise HTTPException(
                status_code=400,
                detail="When monthly salary changes, salary_effective_month and salary_effective_year are required.",
            )
        if body.salary_monthly is None:
            raise HTTPException(status_code=400, detail="salary_monthly is required when recording a salary change.")
        record_salary_change(
            supabase,
            employee_id=employee_id,
            new_salary=float(body.salary_monthly),
            effective_year=int(body.salary_effective_year),
            effective_month=int(body.salary_effective_month),
            previous_salary=float(existing.get("salary_monthly") or 0) if existing.get("salary_monthly") is not None else None,
        )

    row = update_employee(
        employee_id,
        {
            "name": body.name.strip(),
            "at_div_code": body.at_div_code.strip(),
            "email": (body.email.strip() if body.email else None),
            "department": body.department,
            "designation": body.designation,
            "salary_monthly": body.salary_monthly,
            "professional_tax": body.professional_tax,
            "pf_employee_monthly": body.pf_employee_monthly,
            "income_tax_tds_monthly": body.income_tax_tds_monthly,
            "hra_monthly": body.hra_monthly,
            "conveyance_monthly": body.conveyance_monthly,
            "special_allowance_monthly": body.special_allowance_monthly,
            "joining_date": body.joining_date.isoformat() if body.joining_date else None,
        },
        supabase=supabase,
    )
    if not row.get("id"):
        raise HTTPException(status_code=404, detail="Employee not found")
    _save_total_leave(supabase, employee_id, body.total_leave)
    return _employee_out(supabase, row)


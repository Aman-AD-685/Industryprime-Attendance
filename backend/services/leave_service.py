from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

from database.supabase_client import SupabaseRest, get_supabase


def list_leave_requests(status: Optional[str] = None) -> List[Dict[str, Any]]:
    return list_leave_requests_for_tenant(status=status, tenant_id=None, supabase=None)


def list_leave_requests_for_tenant(
    status: Optional[str] = None,
    tenant_id: Optional[str] = None,
    supabase: Optional[SupabaseRest] = None,
) -> List[Dict[str, Any]]:
    if supabase is None:
        supabase = get_supabase()

    where_eq: Optional[Dict[str, Any]] = None
    if status or tenant_id:
        where_eq = {}
        if status:
            where_eq["status"] = status
        if tenant_id:
            where_eq["tenant_id"] = tenant_id

    try:
        return supabase.select(
            table="leave_requests",
            select="*",
            where_eq=where_eq,
            order="created_at.desc",
        )
    except Exception:
        # Phase 2 schema may omit leave_requests; keep UI usable.
        return []


def decide_leave_request(request_id: str, decision: str) -> Dict[str, Any]:
    return decide_leave_request_for_tenant(request_id=request_id, decision=decision, tenant_id=None, supabase=None)


def decide_leave_request_for_tenant(
    request_id: str,
    decision: str,
    tenant_id: Optional[str] = None,
    supabase: Optional[SupabaseRest] = None,
    not_deducted_days: float = 0,
) -> Dict[str, Any]:
    if supabase is None:
        supabase = get_supabase()
    if decision not in ("approved", "rejected", "unapproved"):
        raise ValueError("decision must be 'approved', 'rejected', or 'unapproved'")

    payload = {"status": decision}
    if decision == "unapproved":
        payload["not_deducted_days"] = max(0, float(not_deducted_days or 0))
    updated = supabase.update_single(
        table="leave_requests",
        payload=payload,
        where_eq={k: v for k, v in {"id": request_id, "tenant_id": tenant_id}.items() if v is not None},
    )
    if not updated:
        raise ValueError("Leave request not found")
    return updated


def _is_admin(role: str) -> bool:
    return role in {"master_admin", "admin"}


def _leave_days(row: Dict[str, Any]) -> float:
    if row.get("days") is not None:
        return float(row.get("days") or 0)
    start_raw = row.get("leave_date_start") or row.get("start_date")
    end_raw = row.get("leave_date_end") or row.get("end_date") or start_raw
    if not start_raw:
        return 0
    start = date.fromisoformat(str(start_raw)[:10])
    end = date.fromisoformat(str(end_raw)[:10])
    return float(max(0, (end - start).days + 1))


def list_leave_summary(
    year: int,
    user_email: str,
    role: str,
    supabase: SupabaseRest,
) -> List[Dict[str, Any]]:
    employees = supabase.select(
        table="employees",
        select="*",
        where_eq=None,
        order="name.asc",
    )
    if not _is_admin(role):
        clean_email = user_email.strip().lower()
        employees = [row for row in employees if str(row.get("email") or "").strip().lower() == clean_email]
    employee_by_id = {str(row.get("id")): row for row in employees}
    employee_by_code = {str(row.get("employee_code") or ""): row for row in employees}

    try:
        requests = supabase.select(table="leave_requests", select="*", order="created_at.desc")
    except Exception:
        requests = []

    try:
        balances = supabase.select(table="leave_balances", select="*", where_eq={"year": year})
    except Exception:
        balances = []

    requests_by_employee: Dict[str, List[Dict[str, Any]]] = {emp_id: [] for emp_id in employee_by_id}
    for row in requests:
        emp_id = str(row.get("employee_id") or "")
        if not emp_id and row.get("employee_code") is not None:
            emp = employee_by_code.get(str(row.get("employee_code") or ""))
            emp_id = str(emp.get("id")) if emp else ""
        if emp_id in requests_by_employee:
            requests_by_employee[emp_id].append(row)

    balances_by_employee = {str(row.get("employee_id")): row for row in balances}

    output: List[Dict[str, Any]] = []
    for emp_id, employee in employee_by_id.items():
        emp_requests = requests_by_employee.get(emp_id, [])
        total_used = round(
            sum(_leave_days(row) for row in emp_requests if str(row.get("status") or "").lower() == "approved"),
            2,
        )
        balance = balances_by_employee.get(emp_id) or {}
        total_leave = float(balance.get("total_leave") or 0)
        output.append(
            {
                "employee": {
                    "id": emp_id,
                    "employee_code": employee.get("employee_code"),
                    "name": employee.get("name"),
                    "email": employee.get("email"),
                },
                "year": year,
                "total_leave": total_leave,
                "total_used_leave": total_used,
                "balance_leave": round(total_leave - total_used, 2),
                "requests": emp_requests,
            }
        )
    return output


def get_employee_for_leave(employee_id: str, supabase: SupabaseRest) -> Dict[str, Any]:
    rows = supabase.select(
        table="employees",
        select="id,employee_code,name,email",
        where_eq={"id": employee_id},
        limit=1,
    )
    return rows[0] if rows else {}


def create_leave_request(
    employee: Dict[str, Any],
    leave_date_start: date,
    leave_date_end: date,
    leave_type: str,
    reason: str,
    supabase: SupabaseRest,
) -> Dict[str, Any]:
    days = max(1, (leave_date_end - leave_date_start).days + 1)
    payload = {
        "employee_id": employee["id"],
        "employee_code": employee.get("employee_code"),
        "leave_date_start": leave_date_start.isoformat(),
        "leave_date_end": leave_date_end.isoformat(),
        "leave_type": leave_type,
        "reason": reason,
        "status": "pending",
        "days": days,
    }
    rows = supabase.insert_many(
        table="leave_requests",
        rows=[payload],
        return_representation=True,
    )
    return rows[0] if rows else payload


def update_leave_allocation(
    employee_id: str,
    year: int,
    total_leave: float,
    supabase: SupabaseRest,
) -> Dict[str, Any]:
    payload = {
        "employee_id": employee_id,
        "year": year,
        "total_leave": max(0, float(total_leave or 0)),
    }
    try:
        rows = supabase.upsert_many(
            table="leave_balances",
            rows=[payload],
            on_conflict="employee_id,year",
        )
    except RuntimeError as exc:
        if "leave_balances" in str(exc) or "schema cache" in str(exc):
            return {**payload, "not_persisted": True}
        raise
    return rows[0] if rows else payload


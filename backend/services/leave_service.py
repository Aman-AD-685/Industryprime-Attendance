from __future__ import annotations

import calendar
from datetime import date
from typing import Any, Dict, List, Optional

from database.supabase_client import SupabaseRest, get_supabase

from services.leave_balance_attendance_service import compute_absent_leave_used_by_employee

# Fallback annual entitlement when no `leave_balances` row exists (email not in map).
DEFAULT_ANNUAL_TOTAL_LEAVE = 23.0

# Known allocation (CL+SL) when there is no DB row — keep in sync with leave_balances_seed_by_email.sql.
_DEFAULT_TOTAL_LEAVE_BY_EMAIL: Dict[str, float] = {
    "ea@industryprime.com": 16.0,
    "aman@industryprime.com": 21.0,
    "rimpa@industryprime.com": 21.0,
    "shreyasi@industryprime.com": 20.0,
    "akash@industryprime.com": 20.0,
    "adrija@industryprime.com": 0.0,
}


def _total_leave_for_employee(
    employee: Dict[str, Any],
    balance_row: Optional[Dict[str, Any]],
) -> float:
    """DB row wins if present; else per-email default; else DEFAULT_ANNUAL_TOTAL_LEAVE."""
    if balance_row is not None:
        return float(balance_row.get("total_leave") or 0)
    email = str(employee.get("email") or "").strip().lower()
    if email in _DEFAULT_TOTAL_LEAVE_BY_EMAIL:
        return float(_DEFAULT_TOTAL_LEAVE_BY_EMAIL[email])
    return float(DEFAULT_ANNUAL_TOTAL_LEAVE)


def get_allocated_total_leave(employee: Dict[str, Any], balance_row: Optional[Dict[str, Any]]) -> float:
    """Public accessor for allocation used by routers and attendance leave balance."""
    return _total_leave_for_employee(employee, balance_row)


def _is_missing_days_column(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "leave_requests" in msg and "days" in msg and ("schema cache" in msg or "could not find" in msg)


def _is_missing_employee_id_column(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "leave_requests" in msg and "employee_id" in msg and ("schema cache" in msg or "could not find" in msg)


def _resolve_valid_tenant_id(supabase: SupabaseRest, tenant_id: Optional[str]) -> Optional[str]:
    """
    Ensure tenant_id satisfies leave_requests_tenant_id_fkey when tenants table exists.
    - If provided tenant exists, keep it.
    - Else fallback to first tenant row (single-tenant deployments).
    - If tenants table is unavailable, keep original value.
    """
    if not tenant_id:
        return tenant_id
    try:
        existing = supabase.select(
            table="tenants",
            select="id",
            where_eq={"id": tenant_id},
            limit=1,
        )
        if existing and existing[0].get("id"):
            return str(existing[0]["id"])
        fallback = supabase.select(
            table="tenants",
            select="id",
            order="id.asc",
            limit=1,
        )
        if fallback and fallback[0].get("id"):
            return str(fallback[0]["id"])
        return tenant_id
    except Exception:
        # Keep backward compatibility for schemas without tenants table.
        return tenant_id


def list_leave_requests(status: Optional[str] = None) -> List[Dict[str, Any]]:
    return list_leave_requests_for_tenant(status=status, tenant_id=None, supabase=None)


def _leave_request_overlaps_month(row: Dict[str, Any], year: int, month: int) -> bool:
    start_raw = row.get("leave_date_start") or row.get("start_date")
    end_raw = row.get("leave_date_end") or row.get("end_date") or start_raw
    if not start_raw:
        return True
    try:
        start = date.fromisoformat(str(start_raw)[:10])
        end = date.fromisoformat(str(end_raw)[:10]) if end_raw else start
    except ValueError:
        return True
    _, last_day = calendar.monthrange(year, month)
    first_m = date(year, month, 1)
    last_m = date(year, month, last_day)
    return start <= last_m and end >= first_m


def list_leave_requests_for_tenant(
    status: Optional[str] = None,
    tenant_id: Optional[str] = None,
    supabase: Optional[SupabaseRest] = None,
    employee_id: Optional[str] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
) -> List[Dict[str, Any]]:
    if supabase is None:
        supabase = get_supabase()

    where_eq: Optional[Dict[str, Any]] = None
    st = str(status or "").strip().lower()
    status_for_db: Optional[str] = None
    if st not in {"", "all"} and st != "rejected":
        status_for_db = status
    if tenant_id or status_for_db:
        where_eq = {}
        if status_for_db:
            where_eq["status"] = status_for_db
        if tenant_id:
            where_eq["tenant_id"] = tenant_id

    try:
        rows = supabase.select(
            table="leave_requests",
            select="*",
            where_eq=where_eq,
            order="created_at.desc",
        )
    except Exception:
        # Phase 2 schema may omit leave_requests; keep UI usable.
        return []

    out = rows or []
    if st == "rejected":
        out = [r for r in out if str(r.get("status") or "").lower() in {"rejected", "unapproved"}]
    eid = str(employee_id or "").strip()
    if eid:
        out = [r for r in out if str(r.get("employee_id") or "") == eid]
    if year is not None and month is not None:
        out = [r for r in out if _leave_request_overlaps_month(r, year, month)]
    return out


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
    month: int,
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

    absent_used, period_cap = compute_absent_leave_used_by_employee(
        supabase,
        set(employee_by_id.keys()),
        month,
        year,
    )

    output: List[Dict[str, Any]] = []
    for emp_id, employee in employee_by_id.items():
        emp_requests = requests_by_employee.get(emp_id, [])
        balance_row = balances_by_employee.get(emp_id)
        total_leave = get_allocated_total_leave(employee, balance_row)
        total_used = float(absent_used.get(emp_id, 0))
        raw_balance = float(total_leave) - total_used
        balance_leave = max(0.0, round(raw_balance, 2))
        lop_days = max(0.0, round(total_used - float(total_leave), 2))
        leave_exhausted = balance_leave == 0 and float(total_leave) > 0 and total_used > 0
        output.append(
            {
                "employee": {
                    "id": emp_id,
                    "employee_code": employee.get("employee_code"),
                    "name": employee.get("name"),
                    "email": employee.get("email"),
                },
                "year": year,
                "month": month,
                "total_leave": total_leave,
                "total_used_leave": total_used,
                "total_used": total_used,
                "balance_leave": balance_leave,
                "lop_days": lop_days,
                "leave_exhausted": leave_exhausted,
                "attendance_period_end": period_cap.get(emp_id),
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
    tenant_id: Optional[str] = None,
) -> Dict[str, Any]:
    tenant_id = _resolve_valid_tenant_id(supabase, tenant_id)
    days = max(1, (leave_date_end - leave_date_start).days + 1)
    payload_full = {
        "tenant_id": tenant_id,
        "employee_id": employee["id"],
        "employee_code": employee.get("employee_code"),
        "leave_date_start": leave_date_start.isoformat(),
        "leave_date_end": leave_date_end.isoformat(),
        "leave_type": leave_type,
        "reason": reason,
        "status": "pending",
        "days": days,
    }
    payload_no_days = {
        "tenant_id": tenant_id,
        "employee_id": employee["id"],
        "employee_code": employee.get("employee_code"),
        "leave_date_start": leave_date_start.isoformat(),
        "leave_date_end": leave_date_end.isoformat(),
        "leave_type": leave_type,
        "reason": reason,
        "status": "pending",
    }
    payload_legacy = {
        "tenant_id": tenant_id,
        "employee_code": employee.get("employee_code"),
        "leave_date_start": leave_date_start.isoformat(),
        "leave_date_end": leave_date_end.isoformat(),
        "leave_type": leave_type,
        "reason": reason,
        "status": "pending",
    }
    if not tenant_id:
        payload_full.pop("tenant_id", None)
        payload_no_days.pop("tenant_id", None)
        payload_legacy.pop("tenant_id", None)
    attempts = [payload_full, payload_no_days, payload_legacy]
    try:
        for idx, payload in enumerate(attempts):
            try:
                rows = supabase.insert_many(
                    table="leave_requests",
                    rows=[payload],
                    return_representation=True,
                )
                return rows[0] if rows else payload
            except RuntimeError as exc:
                is_last = idx == len(attempts) - 1
                if not is_last and (
                    _is_missing_days_column(exc) or _is_missing_employee_id_column(exc)
                ):
                    continue
                raise
    except RuntimeError:
        raise
    except Exception:
        raise

    # Unreachable in normal flow; kept for type completeness.
    rows = supabase.insert_many(
        table="leave_requests",
        rows=[payload_legacy],
        return_representation=True,
    )
    return rows[0] if rows else payload_legacy


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


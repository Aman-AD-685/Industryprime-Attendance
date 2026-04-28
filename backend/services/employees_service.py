from __future__ import annotations

from typing import Any, Dict, List, Optional

from database.supabase_client import SupabaseRest, get_supabase


def list_employees(
    status: Optional[str] = None,
    tenant_id: Optional[str] = None,
    supabase: Optional[SupabaseRest] = None,
) -> List[Dict[str, Any]]:
    """
    Phase 2 `public.employees` (no tenant_id / status columns).
    Query param `status` is ignored — kept for API compatibility.
    """
    _ = status
    _ = tenant_id
    if supabase is None:
        supabase = get_supabase()
    return supabase.select(
        table="employees",
        select="*",
        where_eq=None,
        order="name.asc",
        limit=None,
    )


def create_employee(
    payload: Dict[str, Any],
    supabase: Optional[SupabaseRest] = None,
) -> Dict[str, Any]:
    if supabase is None:
        supabase = get_supabase()
    payload = dict(payload)
    payload["employee_code"] = _next_employee_code(supabase)
    rows = supabase.insert_many(
        table="employees",
        rows=[payload],
        return_representation=True,
    )
    if not rows:
        return {}
    return rows[0]


def update_employee(
    employee_id: str,
    payload: Dict[str, Any],
    supabase: Optional[SupabaseRest] = None,
) -> Dict[str, Any]:
    if supabase is None:
        supabase = get_supabase()
    row = supabase.update_single(
        table="employees",
        payload=payload,
        where_eq={"id": employee_id},
    )
    return row or {}


def _next_employee_code(supabase: SupabaseRest) -> str:
    rows = supabase.select(
        table="employees",
        select="employee_code",
        where_eq=None,
        order="employee_code.desc",
        limit=1,
    )
    if not rows:
        return "EMP0001"

    last_code = str(rows[0].get("employee_code") or "")
    digits = "".join(ch for ch in last_code if ch.isdigit())
    next_number = int(digits or "0") + 1
    return f"EMP{next_number:04d}"

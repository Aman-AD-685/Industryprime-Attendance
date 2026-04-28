from __future__ import annotations

from typing import Any, Dict, List, Optional

from database.supabase_client import SupabaseRest, get_supabase, get_supabase_user


def upsert_attendance_records(
    rows: List[Dict[str, Any]],
    tenant_id: Optional[str] = None,
    supabase: Optional[SupabaseRest] = None,
) -> None:
    """
    Upsert attendance rows into `attendance_records`.
    Conflict key: (employee_code, date).
    """
    if supabase is None:
        supabase = get_supabase()

    payload: List[Dict[str, Any]] = []
    for r in rows:
        payload.append(
            {
                "employee_code": r["employee_code"],
                "tenant_id": tenant_id,
                "date": str(r["date"]),
                "check_in": r["check_in"].isoformat(),
                "check_out": r["check_out"].isoformat(),
                "status": r.get("status") or "",
                "working_hours": r["working_hours"],
                "late_minutes": r["late_minutes"],
                "overtime_hours": r["overtime_hours"],
                "final_status": r["final_status"],
            }
        )

    if not payload:
        return

    # Requires unique constraint on (employee_code, date).
    if tenant_id is None:
        # Tenant not provided -> skip persistence.
        return

    supabase.upsert_many(
        table="attendance_records",
        rows=payload,
        on_conflict="tenant_id,employee_code,date",
    )


def fetch_attendance_records(
    tenant_id: Optional[str] = None,
    limit: int = 200,
    supabase: Optional[SupabaseRest] = None,
) -> List[Dict[str, Any]]:
    if supabase is None:
        supabase = get_supabase()

    where_eq = {"tenant_id": tenant_id} if tenant_id else None
    return supabase.select(
        table="attendance_records",
        select="employee_code,date,check_in,check_out,status,working_hours,late_minutes,overtime_hours,final_status",
        where_eq=where_eq,
        order="date.desc",
        limit=limit,
    )


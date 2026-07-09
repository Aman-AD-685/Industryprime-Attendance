from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from database.supabase_client import SupabaseRest, get_supabase_service


def resolve_leave_applicant_display(
    employee: Dict[str, Any],
    *,
    supabase: Optional[SupabaseRest] = None,
) -> Tuple[str, str]:
    """
    Return (email, display_name) for leave approval/notification emails.
    Uses email_lists kind=applicant when configured (email → name).
    """
    email = str(employee.get("email") or "").strip().lower()
    fallback_name = str(employee.get("name") or employee.get("employee_code") or "Employee").strip() or "Employee"
    if not email:
        return "", fallback_name

    db = supabase or get_supabase_service()
    try:
        rows = db.select(
            table="email_lists",
            select="email,name",
            where_eq={"kind": "applicant", "email": email},
            limit=1,
        )
    except Exception:
        return email, fallback_name

    mapped = str((rows[0] if rows else {}).get("name") or "").strip()
    return email, mapped or fallback_name

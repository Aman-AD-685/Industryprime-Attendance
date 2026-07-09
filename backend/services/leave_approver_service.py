from __future__ import annotations

from database.supabase_client import get_supabase_service


def is_leave_approver_email(email: str) -> bool:
    """True when email is on Settings → Email lists (kind=approval)."""
    clean = str(email or "").strip().lower()
    if not clean:
        return False
    try:
        rows = get_supabase_service().select(
            table="email_lists",
            select="email",
            where_eq={"kind": "approval"},
            limit=500,
        )
    except Exception:
        return False
    return any(str(row.get("email") or "").strip().lower() == clean for row in (rows or []))


def can_approve_leave(*, role: str, email: str) -> bool:
    if role in {"master_admin", "admin"}:
        return True
    return is_leave_approver_email(email)

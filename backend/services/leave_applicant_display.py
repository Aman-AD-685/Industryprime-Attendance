from __future__ import annotations

from typing import Any, Dict, Optional, Set, Tuple

from database.supabase_client import SupabaseRest, get_supabase_service


def _find_applicant_mapping(
    employee: Dict[str, Any],
    *,
    supabase: SupabaseRest,
) -> Optional[Dict[str, str]]:
    """
    Match employee to email_lists kind=applicant by login email, then by employee name.
    Returns {"email", "name"} when a Leave apply from row exists.
    """
    email = str(employee.get("email") or "").strip().lower()
    employee_name = str(employee.get("name") or employee.get("employee_code") or "").strip()
    try:
        if email:
            rows = supabase.select(
                table="email_lists",
                select="email,name",
                where_eq={"kind": "applicant", "email": email},
                limit=1,
            )
            if rows:
                row = rows[0]
                mapped_name = str(row.get("name") or "").strip()
                return {
                    "email": str(row.get("email") or email).strip().lower(),
                    "name": mapped_name or employee_name or "Employee",
                }

        if employee_name:
            rows = supabase.select(
                table="email_lists",
                select="email,name",
                where_eq={"kind": "applicant"},
                order="created_at.desc",
                limit=200,
            )
            name_key = employee_name.lower()
            for row in rows or []:
                row_name = str(row.get("name") or "").strip()
                if row_name.lower() == name_key:
                    row_email = str(row.get("email") or "").strip().lower()
                    if row_email:
                        return {"email": row_email, "name": row_name}
    except Exception:
        return None
    return None


def resolve_leave_applicant_display(
    employee: Dict[str, Any],
    *,
    supabase: Optional[SupabaseRest] = None,
) -> Tuple[str, str]:
    """
    Return (email, display_name) for leave approval/notification emails.
    Uses email_lists kind=applicant when configured (email or employee name → display name).
    """
    email = str(employee.get("email") or "").strip().lower()
    fallback_name = str(employee.get("name") or employee.get("employee_code") or "Employee").strip() or "Employee"
    if not email and not fallback_name:
        return "", "Employee"

    db = supabase or get_supabase_service()
    try:
        mapping = _find_applicant_mapping(employee, supabase=db)
    except Exception:
        mapping = None

    if mapping:
        return mapping["email"], mapping["name"]
    return email, fallback_name


def applicant_id_mail_for_notify(
    employee: Dict[str, Any],
    *,
    supabase: Optional[SupabaseRest] = None,
) -> Optional[str]:
    """ID mail from Leave apply from list that should receive apply confirmation."""
    db = supabase or get_supabase_service()
    try:
        mapping = _find_applicant_mapping(employee, supabase=db)
    except Exception:
        return None
    if not mapping:
        return None
    return mapping["email"] or None


def send_leave_applicant_id_notification(
    *,
    employee: Dict[str, Any],
    applicant_name: str,
    applicant_email: str,
    from_date: str,
    to_date: str,
    reason: str,
    already_notified: Set[str],
    supabase: Optional[SupabaseRest] = None,
) -> bool:
    """Notify the Leave apply from ID mail when that employee applies leave."""
    from services.email_service import render_email_template, send_email

    to_email = applicant_id_mail_for_notify(employee, supabase=supabase)
    if not to_email or to_email in already_notified:
        return False

    html = render_email_template(
        "leave_notification.html",
        {
            "applicant_name": applicant_name,
            "applicant_email": applicant_email,
            "from_date": from_date,
            "to_date": to_date,
            "reason": reason,
        },
    )
    return bool(
        send_email(
            to_email,
            subject=f"Leave Applied — {applicant_name} ({from_date} -> {to_date})",
            html=html,
            text=f"FYI: {applicant_name} applied leave for {from_date} -> {to_date}.",
        )
    )

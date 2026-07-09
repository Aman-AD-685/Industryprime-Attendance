from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from database.supabase_client import SupabaseRest, get_supabase_service


def _norm_email(raw: Any) -> str:
    return str(raw or "").strip().lower()


def _find_applicant_mapping(
    employee: Dict[str, Any],
    *,
    supabase: SupabaseRest,
) -> Optional[Dict[str, str]]:
    """
    Match employee to email_lists kind=applicant by login email, then by employee name.
    Returns email, name, approver_email when a Leave apply from row exists.
    """
    email = _norm_email(employee.get("email"))
    employee_name = str(employee.get("name") or employee.get("employee_code") or "").strip()

    def _row_to_mapping(row: Dict[str, Any], fallback_name: str) -> Dict[str, str]:
        mapped_name = str(row.get("name") or "").strip()
        row_email = _norm_email(row.get("email"))
        return {
            "email": row_email or email,
            "name": mapped_name or fallback_name or "Employee",
            "approver_email": _norm_email(row.get("approver_email")),
        }

    try:
        if email:
            rows = supabase.select(
                table="email_lists",
                select="email,name,approver_email",
                where_eq={"kind": "applicant", "email": email},
                limit=1,
            )
            if rows:
                return _row_to_mapping(rows[0], employee_name)

        if employee_name:
            rows = supabase.select(
                table="email_lists",
                select="email,name,approver_email",
                where_eq={"kind": "applicant"},
                order="created_at.desc",
                limit=200,
            )
            name_key = employee_name.lower()
            for row in rows or []:
                row_name = str(row.get("name") or "").strip()
                if row_name.lower() == name_key:
                    mapped = _row_to_mapping(row, employee_name)
                    if mapped["email"]:
                        return mapped
    except Exception:
        return None
    return None


def resolve_leave_applicant_mapping(
    employee: Dict[str, Any],
    *,
    supabase: Optional[SupabaseRest] = None,
) -> Optional[Dict[str, str]]:
    db = supabase or get_supabase_service()
    try:
        return _find_applicant_mapping(employee, supabase=db)
    except Exception:
        return None


def resolve_leave_applicant_display(
    employee: Dict[str, Any],
    *,
    supabase: Optional[SupabaseRest] = None,
) -> Tuple[str, str]:
    """Return (email, display_name) for leave emails."""
    email = _norm_email(employee.get("email"))
    fallback_name = str(employee.get("name") or employee.get("employee_code") or "Employee").strip() or "Employee"
    mapping = resolve_leave_applicant_mapping(employee, supabase=supabase)
    if mapping:
        return mapping["email"], mapping["name"]
    return email, fallback_name


def applicant_id_mail_for_notify(
    employee: Dict[str, Any],
    *,
    supabase: Optional[SupabaseRest] = None,
) -> Optional[str]:
    mapping = resolve_leave_applicant_mapping(employee, supabase=supabase)
    if not mapping:
        return None
    return mapping["email"] or None


def applicant_approver_email(
    employee: Dict[str, Any],
    *,
    supabase: Optional[SupabaseRest] = None,
) -> Optional[str]:
    mapping = resolve_leave_applicant_mapping(employee, supabase=supabase)
    if not mapping:
        return None
    approver = mapping.get("approver_email") or ""
    return approver or None

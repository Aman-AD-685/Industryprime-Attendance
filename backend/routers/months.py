from __future__ import annotations

from typing import Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException

from database.supabase_client import get_supabase_user
from dependencies.auth_dependency import get_auth_context
from services.attendance_management_service import list_months

router = APIRouter()


@router.get("/{employee_id}", response_model=List[Dict[str, int]])
def get_months(employee_id: str, authorization: Optional[str] = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    if auth.role not in {"master_admin", "admin"}:
        rows = get_supabase_user(auth.access_token).select(
            table="employees",
            select="id,email",
            where_eq={"id": employee_id},
            limit=1,
        )
        employee = rows[0] if rows else {}
        if str(employee.get("email") or "").strip().lower() != auth.email.strip().lower():
            raise HTTPException(status_code=403, detail="You can only view your own attendance months")
    return list_months(employee_id, supabase=get_supabase_user(auth.access_token))

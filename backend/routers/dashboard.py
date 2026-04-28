from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional

from fastapi import APIRouter, Query
from fastapi import Header, HTTPException

from services.dashboard_service import get_dashboard_summary
from dependencies.auth_dependency import get_auth_context
from database.supabase_client import get_supabase_user

router = APIRouter()


@router.get("/summary", response_model=Dict[str, Any])
def dashboard_summary(
    for_date: Optional[date] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")

    auth = get_auth_context(authorization=authorization)
    return get_dashboard_summary(
        for_date=for_date,
        tenant_id=auth.tenant_id,
        supabase=get_supabase_user(auth.access_token),
    )


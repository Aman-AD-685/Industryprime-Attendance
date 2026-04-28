from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Path, status
from pydantic import BaseModel, Field

from database.supabase_client import get_supabase_service
from dependencies.auth_dependency import get_auth_context
from services.auth_service import (
    ALLOWED_ROLES,
    authenticate_user,
    create_access_token,
    public_user,
    require_role,
    signup_user,
)


router = APIRouter()


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    password: str = Field(..., min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)


class RoleUpdateRequest(BaseModel):
    role: str = Field(..., pattern="^(master_admin|admin|user)$")


@router.post("/signup", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest):
    """
    Public signup. Role is intentionally fixed to `user`; admins are assigned manually
    in the database or by a Master Admin after login.
    """
    user = signup_user(payload.name, payload.email, payload.password)
    return {"user": public_user(user)}


@router.post("/login", response_model=Dict[str, Any])
def login(payload: LoginRequest):
    user = authenticate_user(payload.email, payload.password)
    public = public_user(user)
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": public,
    }


@router.get("/me", response_model=Dict[str, Any])
def me(authorization: Optional[str] = Header(default=None)):
    auth = get_auth_context(authorization=authorization)
    return {
        "user": {
            "id": auth.user_id,
            "name": auth.name,
            "email": auth.email,
            "role": auth.role,
        }
    }


@router.post("/forgot-password", response_model=Dict[str, Any])
def forgot_password(payload: ForgotPasswordRequest):
    # Placeholder hook for SMTP/provider integration. Keep response generic to avoid
    # leaking whether an email exists.
    return {
        "ok": True,
        "message": "If an account exists, a password reset link will be sent.",
        "email": payload.email.strip().lower(),
    }


@router.get("/users", response_model=List[Dict[str, Any]])
def list_users(authorization: Optional[str] = Header(default=None)):
    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin")

    rows = get_supabase_service().select(
        table="users",
        select="id,name,email,role,created_at",
        order="created_at.desc",
        limit=200,
    )
    return [public_user(row) for row in rows]


@router.patch("/users/{user_id}/role", response_model=Dict[str, Any])
def update_user_role(
    payload: RoleUpdateRequest,
    user_id: str = Path(...),
    authorization: Optional[str] = Header(default=None),
):
    auth = get_auth_context(authorization=authorization)
    require_role({"role": auth.role}, "master_admin")

    if payload.role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if user_id == auth.user_id and payload.role != "master_admin":
        raise HTTPException(status_code=400, detail="Master Admin cannot demote themselves")

    updated = get_supabase_service().update_single(
        table="users",
        payload={"role": payload.role},
        where_eq={"id": user_id},
    )
    if not updated:
        raise HTTPException(status_code=404, detail="User not found")
    return {"user": public_user(updated)}


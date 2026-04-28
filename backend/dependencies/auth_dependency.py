from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Header, HTTPException, status

from services.auth_service import decode_access_token, get_user_by_id


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    tenant_id: str
    access_token: str
    email: str
    name: str
    role: str


def _get_user_from_supabase(access_token: str) -> dict:
    # Backward-compatible name for existing imports. Auth is now backend-owned JWT.
    payload = decode_access_token(access_token)
    return {
        "id": payload["sub"],
        "email": payload["email"],
        "name": payload.get("name") or "",
        "role": payload["role"],
    }


def _get_tenant_id_for_user(user_id: str) -> str:
    # Existing HRIS services are tenant-aware. Until a tenant table is introduced for
    # backend-owned auth, scope user data to the authenticated user's UUID.
    return user_id


def get_auth_context(authorization: Optional[str] = Header(default=None)) -> AuthContext:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization bearer token",
        )
    access_token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(access_token)
        user_id = str(payload["sub"])
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token (no user id)",
            )
        user = get_user_by_id(user_id)
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
        tenant_id = _get_tenant_id_for_user(user_id)
        return AuthContext(
            user_id=user_id,
            tenant_id=tenant_id,
            access_token=access_token,
            email=str(user["email"]),
            name=str(user["name"]),
            role=str(user["role"]),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        ) from e


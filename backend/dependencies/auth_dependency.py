from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from fastapi import Header, HTTPException, status

from services.auth_service import decode_access_token, get_user_by_id

logger = logging.getLogger(__name__)

# users row per id, so every authenticated request does not cost a Supabase round trip.
_USER_CACHE_TTL_SECONDS = 60.0
_user_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_user_cache_lock = threading.Lock()


def invalidate_user_cache(user_id: Optional[str] = None) -> None:
    with _user_cache_lock:
        if user_id is None:
            _user_cache.clear()
        else:
            _user_cache.pop(str(user_id), None)


def cached_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    """
    ``users`` row by id, cached for 60 s.

    A Supabase blip must not look like a bad token: when the lookup fails we serve the
    last known row, and with nothing cached we answer 503 so the browser keeps its session
    and retries instead of logging the user out.
    """
    key = str(user_id)
    now = time.monotonic()
    with _user_cache_lock:
        hit = _user_cache.get(key)
    if hit and hit[0] > now:
        return hit[1]
    try:
        user = get_user_by_id(key)
    except HTTPException:
        raise
    except Exception as exc:
        if hit:
            logger.warning("users lookup failed; using cached row for %s: %s", key, exc)
            return hit[1]
        logger.warning("users lookup failed for %s: %s", key, exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service is temporarily unavailable. Please retry.",
        ) from exc
    if user:
        with _user_cache_lock:
            _user_cache[key] = (now + _USER_CACHE_TTL_SECONDS, user)
    return user


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
        user = cached_user_by_id(user_id)
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


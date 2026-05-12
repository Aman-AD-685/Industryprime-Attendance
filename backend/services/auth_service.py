from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from typing import Any, Dict, Literal, Optional

from fastapi import HTTPException, status

from database.supabase_client import SupabaseRest, _bootstrap_backend_env, get_supabase_service

Role = Literal["master_admin", "admin", "user"]
ALLOWED_ROLES: set[str] = {"master_admin", "admin", "user"}
_DEV_AUTH_PATH = Path(__file__).resolve().parent.parent / "database" / "dev_auth_users.json"
AUTH_SCHEMA_HINT = (
    "Auth database is not ready. Run backend/database/auth_schema.sql in the Supabase SQL Editor, "
    "then restart the backend so Supabase refreshes the users table schema."
)


def _jwt_secret() -> str:
    _bootstrap_backend_env()
    secret = os.getenv("JWT_SECRET", "").strip()
    if not secret:
        raise RuntimeError("Missing JWT_SECRET env var in backend/.env")
    return secret


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 210_000)
    return "pbkdf2_sha256$210000$" + base64.urlsafe_b64encode(salt).decode("ascii") + "$" + base64.urlsafe_b64encode(digest).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = password_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_raw)
        salt = base64.urlsafe_b64decode(salt_raw.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_raw.encode("ascii"))
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def create_access_token(user: Dict[str, Any], expires_in_seconds: int = 60 * 60 * 8) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "name": user.get("name") or "",
        "role": user["role"],
        "iat": now,
        "exp": now + expires_in_seconds,
    }
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = (
        _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
        + "."
        + _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    )
    signature = hmac.new(_jwt_secret().encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return signing_input + "." + _b64url_encode(signature)


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        header_raw, payload_raw, signature_raw = token.split(".", 2)
        signing_input = f"{header_raw}.{payload_raw}"
        expected = hmac.new(_jwt_secret().encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
        actual = _b64url_decode(signature_raw)
        if not hmac.compare_digest(actual, expected):
            raise ValueError("Invalid signature")
        payload = json.loads(_b64url_decode(payload_raw))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    if int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    if payload.get("role") not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token role")
    return payload


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _is_missing_users_table(exc: RuntimeError) -> bool:
    message = str(exc)
    return "public.users" in message or "schema cache" in message


def _allow_local_auth_fallback() -> bool:
    _bootstrap_backend_env()
    return os.getenv("ALLOW_LOCAL_AUTH_FALLBACK", "").strip().lower() in {"1", "true", "yes"}


def _read_dev_users() -> list[Dict[str, Any]]:
    if not _DEV_AUTH_PATH.is_file():
        return []
    try:
        data = json.loads(_DEV_AUTH_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _write_dev_users(users: list[Dict[str, Any]]) -> None:
    _DEV_AUTH_PATH.parent.mkdir(parents=True, exist_ok=True)
    _DEV_AUTH_PATH.write_text(json.dumps(users, indent=2), encoding="utf-8")


def _get_dev_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    clean_email = normalize_email(email)
    return next((user for user in _read_dev_users() if user.get("email") == clean_email), None)


def _get_dev_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    return next((user for user in _read_dev_users() if str(user.get("id")) == user_id), None)


def _create_dev_user(name: str, email: str, password: str) -> Dict[str, Any]:
    clean_email = normalize_email(email)
    users = _read_dev_users()
    if any(user.get("email") == clean_email for user in users):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    user = {
        "id": secrets.token_hex(16),
        "name": name.strip(),
        "email": clean_email,
        "password_hash": hash_password(password),
        "role": "user",
        "created_at": None,
        "storage": "local_dev",
    }
    users.append(user)
    _write_dev_users(users)
    return user


def get_user_by_email(email: str, supabase: Optional[SupabaseRest] = None) -> Optional[Dict[str, Any]]:
    try:
        rows = (supabase or get_supabase_service()).select(
            table="users",
            select="id,name,email,password_hash,role,created_at",
            where_eq={"email": normalize_email(email)},
            limit=1,
        )
    except RuntimeError as exc:
        if _is_missing_users_table(exc):
            if _allow_local_auth_fallback():
                return _get_dev_user_by_email(email)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=AUTH_SCHEMA_HINT,
            ) from exc
        raise
    return rows[0] if rows else None


def get_user_by_id(user_id: str, supabase: Optional[SupabaseRest] = None) -> Optional[Dict[str, Any]]:
    try:
        rows = (supabase or get_supabase_service()).select(
            table="users",
            select="id,name,email,role,created_at",
            where_eq={"id": user_id},
            limit=1,
        )
    except RuntimeError as exc:
        if _is_missing_users_table(exc):
            if _allow_local_auth_fallback():
                return _get_dev_user_by_id(user_id)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=AUTH_SCHEMA_HINT,
            ) from exc
        raise
    return rows[0] if rows else None


def public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(user["id"]),
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "created_at": user.get("created_at"),
    }


def signup_user(name: str, email: str, password: str) -> Dict[str, Any]:
    supabase = get_supabase_service()
    clean_email = normalize_email(email)
    if get_user_by_email(clean_email, supabase):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")

    try:
        rows = supabase.insert_many(
            table="users",
            rows=[
                {
                    "name": name.strip(),
                    "email": clean_email,
                    "password_hash": hash_password(password),
                    "role": "user",
                }
            ],
            return_representation=True,
        )
    except RuntimeError as exc:
        if _is_missing_users_table(exc):
            if _allow_local_auth_fallback():
                return _create_dev_user(name, clean_email, password)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=AUTH_SCHEMA_HINT,
            ) from exc
        raise
    if not rows:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create user")
    return rows[0]


def authenticate_user(email: str, password: str) -> Dict[str, Any]:
    user = get_user_by_email(email)
    if not user or not verify_password(password, str(user.get("password_hash") or "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password. If this is your first time, use Signup to create a User account.",
        )
    return user


def require_role(user: Dict[str, Any], *roles: Role) -> None:
    if user.get("role") not in roles:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")


def create_pending_signup(name: str, email: str, password_hash: str, supabase: Optional[SupabaseRest] = None) -> None:
    db = supabase or get_supabase_service()
    clean_email = normalize_email(email)
    existing = get_user_by_email(clean_email, db)
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")
    db.upsert_many(
        table="pending_signups",
        rows=[
            {
                "email": clean_email,
                "name": name.strip(),
                "password_hash": password_hash,
            }
        ],
        on_conflict="email",
    )


def get_pending_signup(email: str, supabase: Optional[SupabaseRest] = None) -> Optional[Dict[str, Any]]:
    db = supabase or get_supabase_service()
    rows = db.select(
        table="pending_signups",
        select="email,name,password_hash,created_at",
        where_eq={"email": normalize_email(email)},
        limit=1,
    )
    return rows[0] if rows else None


def consume_pending_signup(email: str, supabase: Optional[SupabaseRest] = None) -> Optional[Dict[str, Any]]:
    db = supabase or get_supabase_service()
    pending = get_pending_signup(email, db)
    if not pending:
        return None
    clean_email = normalize_email(email)
    return create_registered_user(
        name=str(pending["name"]),
        email=clean_email,
        password_hash=str(pending["password_hash"]),
        supabase=db,
    )


def create_registered_user(
    *,
    name: str,
    email: str,
    password_hash: str,
    supabase: Optional[SupabaseRest] = None,
) -> Optional[Dict[str, Any]]:
    """
    Insert a finalized `users` row (password already hashed). Used after OTP / pending signup.
    """
    db = supabase or get_supabase_service()
    clean_email = normalize_email(email)
    if get_user_by_email(clean_email, db):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")
    try:
        rows = db.insert_many(
            table="users",
            rows=[
                {
                    "name": name.strip(),
                    "email": clean_email,
                    "password_hash": password_hash,
                    "role": "user",
                }
            ],
            return_representation=True,
        )
    except RuntimeError as exc:
        if _is_missing_users_table(exc):
            if _allow_local_auth_fallback():
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Stateless signup requires the Supabase `users` table (run auth_schema.sql) or disable OTP tables and use dev auth per docs.",
                ) from exc
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=AUTH_SCHEMA_HINT) from exc
        raise
    return rows[0] if rows else None

from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Header, HTTPException, Path, status
from pydantic import BaseModel, Field

from database.supabase_client import get_supabase_service
from dependencies.auth_dependency import get_auth_context
from services.auth_service import (
    ALLOWED_ROLES,
    authenticate_user,
    consume_pending_signup,
    create_access_token,
    create_pending_signup,
    get_pending_signup,
    hash_password,
    public_user,
    require_role,
    signup_user,
)
from services.audit_service import record_audit_event
from services.otp_service import issue_otp, verify_latest_otp
from services.signup_stateless import (
    complete_stateless_signup,
    resend_stateless_signup,
    signup_otp_tables_available,
    start_stateless_signup,
)


router = APIRouter()

_OTP_SCHEMA_HINT = (
    "Signup requires tables `pending_signups` and `otp_codes`. "
    "In the Supabase SQL editor, run `backend/database/otp_schema.sql`, then try again."
)


def _raise_if_signup_infra_error(exc: Exception) -> None:
    """Turn missing Supabase tables / missing SMTP config into HTTP errors with actionable text."""
    if isinstance(exc, HTTPException):
        raise exc
    raw = str(exc)
    low = raw.lower()
    if "pgrst205" in low or (
        "could not find the table" in low and ("pending_signups" in low or "otp_codes" in low)
    ):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=_OTP_SCHEMA_HINT) from exc
    if (
        "postmark is not configured on the fastapi server" in low
        or "missing smtp password env var" in low
        or "email (smtp) is not configured" in low
    ):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Cannot send the signup code: SMTP is not configured on the FastAPI host "
                "(Supabase Auth → SMTP does not apply). Set POSTMARK_SMTP_USERNAME, POSTMARK_SMTP_TOKEN, "
                "SMTP_FROM_EMAIL (or POSTMARK_FROM_EMAIL) where the API runs (e.g. Render env + redeploy), "
                "or backend/.env locally."
            ),
        ) from exc
    raise exc


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


class SignupVerifyRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    code: str = Field(..., min_length=6, max_length=6)
    signup_ticket: Optional[str] = None


class SignupResendRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=255)
    signup_ticket: Optional[str] = None


def _validate_email_like(email: str) -> str:
    clean = str(email or "").strip().lower()
    if "@" not in clean or "." not in clean.split("@")[-1]:
        raise HTTPException(status_code=400, detail="Enter a valid email address.")
    return clean


@router.post("/signup/start", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
def signup_start(payload: SignupRequest):
    clean_email = _validate_email_like(payload.email)
    supabase = get_supabase_service()
    if signup_otp_tables_available(supabase):
        try:
            create_pending_signup(
                payload.name.strip(),
                clean_email,
                hash_password(payload.password),
                supabase=supabase,
            )
            issue_otp(
                supabase,
                email=clean_email,
                purpose="signup",
                subject="Your IndustryPrime signup code",
            )
        except HTTPException:
            raise
        except Exception as exc:
            _raise_if_signup_infra_error(exc)
        return {"otp_sent": True, "email": clean_email}
    try:
        ticket = start_stateless_signup(
            supabase=supabase,
            name=payload.name.strip(),
            email=clean_email,
            password_plain=payload.password,
            subject="Your IndustryPrime signup code",
        )
    except HTTPException:
        raise
    except Exception as exc:
        _raise_if_signup_infra_error(exc)
    return {"otp_sent": True, "email": clean_email, "signup_ticket": ticket}


@router.post("/signup/verify", response_model=Dict[str, Any])
def signup_verify(payload: SignupVerifyRequest):
    clean_email = _validate_email_like(payload.email)
    supabase = get_supabase_service()
    ticket = (payload.signup_ticket or "").strip()
    user: Optional[Dict[str, Any]] = None
    if ticket:
        try:
            user = complete_stateless_signup(
                supabase=supabase,
                expected_email=clean_email,
                signup_ticket=ticket,
                code=payload.code,
            )
        except HTTPException:
            raise
        except Exception as exc:
            _raise_if_signup_infra_error(exc)
    else:
        try:
            pending = get_pending_signup(clean_email, supabase)
            if not pending:
                raise HTTPException(status_code=400, detail="No pending signup found. Start signup again.")
            verify_latest_otp(
                supabase,
                email=clean_email,
                purpose="signup",
                code=payload.code,
            )
            user = consume_pending_signup(clean_email, supabase)
        except HTTPException:
            raise
        except Exception as exc:
            _raise_if_signup_infra_error(exc)
    if not user:
        raise HTTPException(status_code=500, detail="Signup verification failed.")
    try:
        record_audit_event(
            supabase,
            actor_email=clean_email,
            action="signup_verified",
            target_id=str(user.get("id")),
            metadata={"email": clean_email},
        )
    except Exception:
        pass
    return {
        "access_token": create_access_token(user),
        "token_type": "bearer",
        "user": public_user(user),
    }


@router.post("/signup/resend", response_model=Dict[str, Any])
def signup_resend(payload: SignupResendRequest):
    clean_email = _validate_email_like(payload.email)
    supabase = get_supabase_service()
    ticket = (payload.signup_ticket or "").strip()
    if ticket:
        try:
            new_ticket = resend_stateless_signup(
                expected_email=clean_email,
                previous_ticket=ticket,
                subject="Your IndustryPrime signup code",
            )
        except HTTPException:
            raise
        except Exception as exc:
            _raise_if_signup_infra_error(exc)
        return {"otp_sent": True, "email": clean_email, "signup_ticket": new_ticket}
    try:
        if not get_pending_signup(clean_email, supabase):
            raise HTTPException(status_code=400, detail="No pending signup found.")
        issue_otp(
            supabase,
            email=clean_email,
            purpose="signup",
            subject="Your IndustryPrime signup code",
        )
    except HTTPException:
        raise
    except Exception as exc:
        _raise_if_signup_infra_error(exc)
    return {"otp_sent": True, "email": clean_email}


@router.post("/signup", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest):
    # Backward-compatible direct signup (legacy clients).
    user = signup_user(payload.name, payload.email, payload.password)
    return {"user": public_user(user)}


@router.post("/login", response_model=Dict[str, Any])
def login(payload: LoginRequest):
    try:
        user = authenticate_user(payload.email, payload.password)
        public = public_user(user)
        record_audit_event(
            get_supabase_service(),
            actor_email=public.get("email"),
            action="login_verified",
            target_id=public.get("id"),
            metadata={"role": public.get("role")},
        )
        return {
            "access_token": create_access_token(user),
            "token_type": "bearer",
            "user": public,
        }
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Login service is not configured correctly: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Login failed on backend: {type(exc).__name__}",
        ) from exc


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


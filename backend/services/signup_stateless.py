"""
OTP signup when `pending_signups` / `otp_codes` tables are not migrated yet.

Uses an HMAC-signed ticket (returned to the browser, also sent OTP by email) instead of DB rows.
Prefer running `backend/database/otp_schema.sql` in production for rate limits and durability.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any, Dict

from fastapi import HTTPException, status

from database.supabase_client import SupabaseRest
from services.auth_service import (
    create_registered_user,
    get_user_by_email,
    hash_password,
    normalize_email,
)
from services.email_service import render_email_template, send_email
from services.otp_service import OTP_TTL_MINUTES, _bcrypt_hash, _bcrypt_verify


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def _is_missing_signup_table(exc: RuntimeError, table: str) -> bool:
    raw = str(exc).lower()
    t = table.lower()
    if "pgrst205" not in raw and "could not find the table" not in raw:
        return False
    return t in raw


def signup_otp_tables_available(supabase: SupabaseRest) -> bool:
    for table in ("pending_signups", "otp_codes"):
        try:
            supabase.select(table=table, select="*", limit=1)
        except RuntimeError as exc:
            if _is_missing_signup_table(exc, table):
                return False
            raise
    return True


def _jwt_secret() -> str:
    from services.auth_service import _jwt_secret as secret_fn

    return secret_fn()


def _issue_ticket(*, email: str, name: str, password_plain: str, code: str) -> str:
    """Return dot-separated signed blob: b64url(json).b64url(hmac)."""
    payload = {
        "v": 1,
        "typ": "signup_ticket",
        "email": email,
        "name": name.strip(),
        "ph": hash_password(password_plain),
        "ch": _bcrypt_hash(code),
        "exp": int(time.time()) + OTP_TTL_MINUTES * 60,
    }
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    body_b64 = _b64url_encode(body)
    sig = hmac.new(_jwt_secret().encode("utf-8"), body_b64.encode("ascii"), hashlib.sha256).digest()
    return body_b64 + "." + _b64url_encode(sig)


def _parse_ticket(token: str) -> Dict[str, Any]:
    parts = token.strip().split(".")
    if len(parts) != 2:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signup session.")
    body_b64, sig_b64 = parts
    expected_sig = hmac.new(_jwt_secret().encode("utf-8"), body_b64.encode("ascii"), hashlib.sha256).digest()
    try:
        actual_sig = _b64url_decode(sig_b64)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signup session.") from exc
    if not hmac.compare_digest(expected_sig, actual_sig):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signup session.")
    try:
        payload = json.loads(_b64url_decode(body_b64).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signup session.") from exc
    if payload.get("typ") != "signup_ticket" or int(payload.get("v") or 0) != 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signup session.")
    return payload


def start_stateless_signup(
    *,
    supabase: SupabaseRest,
    name: str,
    email: str,
    password_plain: str,
    subject: str,
) -> str:
    clean = normalize_email(email)
    if get_user_by_email(clean, supabase):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User already exists")
    code = f"{secrets.randbelow(1_000_000):06d}"
    ticket = _issue_ticket(email=clean, name=name, password_plain=password_plain, code=code)
    html = render_email_template(
        "otp_email.html",
        {"email": clean, "code": code, "purpose": "signup", "minutes": OTP_TTL_MINUTES},
    )
    text = f"Your IndustryPrime signup code is {code}. It expires in {OTP_TTL_MINUTES} minutes."
    send_email(clean, subject=subject, html=html, text=text)
    return ticket


def resend_stateless_signup(
    *,
    expected_email: str,
    previous_ticket: str,
    subject: str,
) -> str:
    payload = _parse_ticket(previous_ticket)
    if int(payload.get("exp") or 0) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Signup session expired. Start signup again.")
    email = normalize_email(str(payload.get("email") or ""))
    if email != normalize_email(expected_email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signup session.")
    name = str(payload.get("name") or "")
    ph = str(payload.get("ph") or "")
    if not email or "@" not in email or not name or not ph:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signup session.")
    # ph is pbkdf2 hash — we cannot recover plain password; resend uses same hash in new ticket.
    code = f"{secrets.randbelow(1_000_000):06d}"
    new_payload = {
        "v": 1,
        "typ": "signup_ticket",
        "email": email,
        "name": name,
        "ph": ph,
        "ch": _bcrypt_hash(code),
        "exp": int(time.time()) + OTP_TTL_MINUTES * 60,
    }
    body = json.dumps(new_payload, separators=(",", ":"), sort_keys=True).encode()
    body_b64 = _b64url_encode(body)
    sig = hmac.new(_jwt_secret().encode("utf-8"), body_b64.encode("ascii"), hashlib.sha256).digest()
    ticket = body_b64 + "." + _b64url_encode(sig)
    html = render_email_template(
        "otp_email.html",
        {"email": email, "code": code, "purpose": "signup", "minutes": OTP_TTL_MINUTES},
    )
    text = f"Your IndustryPrime signup code is {code}. It expires in {OTP_TTL_MINUTES} minutes."
    send_email(email, subject=subject, html=html, text=text)
    return ticket


def complete_stateless_signup(
    *,
    supabase: SupabaseRest,
    expected_email: str,
    signup_ticket: str,
    code: str,
) -> Dict[str, Any]:
    payload = _parse_ticket(signup_ticket)
    if int(payload.get("exp") or 0) < int(time.time()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Signup session expired. Start signup again.")
    email = normalize_email(str(payload.get("email") or ""))
    if email != normalize_email(expected_email):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signup session.")
    name = str(payload.get("name") or "").strip()
    ph = str(payload.get("ph") or "")
    ch = str(payload.get("ch") or "")
    if not email or not name or not ph or not ch:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signup session.")
    if not _bcrypt_verify(code.strip(), ch):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP code.")
    user = create_registered_user(name=name, email=email, password_hash=ph, supabase=supabase)
    if not user:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Signup verification failed.")
    return user

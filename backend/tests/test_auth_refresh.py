from __future__ import annotations

import pytest
from fastapi import HTTPException

from services.auth_service import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    issue_auth_tokens,
)


def test_issue_auth_tokens_and_decode():
    user = {
        "id": "11111111-1111-1111-1111-111111111111",
        "email": "test@example.com",
        "name": "Test",
        "role": "user",
    }
    tokens = issue_auth_tokens(user)
    assert "access_token" in tokens
    assert "refresh_token" in tokens

    access = decode_access_token(tokens["access_token"])
    assert access["email"] == "test@example.com"
    assert access["role"] == "user"

    refresh = decode_refresh_token(tokens["refresh_token"])
    assert refresh["sub"] == user["id"]

    with pytest.raises(HTTPException) as exc:
        decode_access_token(tokens["refresh_token"])
    assert exc.value.status_code == 401


def test_refresh_token_cannot_be_used_as_access():
    user = {"id": "abc", "email": "a@b.com", "name": "A", "role": "admin"}
    refresh = create_refresh_token(user)
    with pytest.raises(HTTPException):
        decode_access_token(refresh)


def test_access_token_without_typ_still_works():
    user = {"id": "abc", "email": "a@b.com", "name": "A", "role": "admin"}
    # Legacy tokens omit typ — decode_access_token should accept role-only payloads
    token = create_access_token(user)
    payload = decode_access_token(token)
    assert payload["role"] == "admin"

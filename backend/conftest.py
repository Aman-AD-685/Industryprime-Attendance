"""
Shared pytest fixtures. Set auth-related env before importing the FastAPI app.
"""

from __future__ import annotations

import os
from collections.abc import Generator
from unittest.mock import MagicMock, patch

import pytest
from starlette.testclient import TestClient

# Stable CI defaults before any test module imports `main` or `auth_service`.
os.environ.setdefault("JWT_SECRET", "ci-test-jwt-secret-minimum-32-characters-long")
os.environ.setdefault("ALLOW_LOCAL_AUTH_FALLBACK", "1")


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    from main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_auth_headers() -> Generator[dict[str, str], None, None]:
    """Bearer token for a master_admin user; Supabase user lookup is mocked."""
    uid = "00000000-0000-0000-0000-000000000099"
    profile = {
        "id": uid,
        "email": "ci-admin@test.invalid",
        "name": "CI Admin",
        "role": "master_admin",
    }
    with patch("dependencies.auth_dependency.get_user_by_id", return_value=profile):
        from services.auth_service import create_access_token

        token = create_access_token(
            {
                "id": uid,
                "email": profile["email"],
                "name": profile["name"],
                "role": profile["role"],
            }
        )
        yield {"Authorization": f"Bearer {token}"}


@pytest.fixture
def user_auth_headers() -> Generator[dict[str, str], None, None]:
    """Bearer token for a regular user; Supabase user lookup is mocked."""
    uid = "00000000-0000-0000-0000-000000000088"
    profile = {
        "id": uid,
        "email": "ci-user@test.invalid",
        "name": "CI User",
        "role": "user",
    }
    with patch("dependencies.auth_dependency.get_user_by_id", return_value=profile):
        from services.auth_service import create_access_token

        token = create_access_token(
            {
                "id": uid,
                "email": profile["email"],
                "name": profile["name"],
                "role": profile["role"],
            }
        )
        yield {"Authorization": f"Bearer {token}"}


@pytest.fixture
def mock_supabase() -> MagicMock:
    return MagicMock(name="supabase")

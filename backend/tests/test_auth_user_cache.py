"""A Supabase blip during the per-request user lookup must not log the user out (401)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

import dependencies.auth_dependency as dep


@pytest.fixture(autouse=True)
def _clear_cache():
    dep.invalidate_user_cache()
    yield
    dep.invalidate_user_cache()


def test_lookup_is_cached(monkeypatch) -> None:
    calls = []

    def fake(user_id, supabase=None):
        calls.append(user_id)
        return {"id": user_id, "email": "a@x.com", "name": "A", "role": "admin"}

    monkeypatch.setattr(dep, "get_user_by_id", fake)
    assert dep.cached_user_by_id("u1")["role"] == "admin"
    assert dep.cached_user_by_id("u1")["role"] == "admin"
    assert calls == ["u1"]


def test_infra_error_without_cache_is_503_not_401(monkeypatch) -> None:
    def boom(user_id, supabase=None):
        raise RuntimeError("Supabase request failed: connection reset")

    monkeypatch.setattr(dep, "get_user_by_id", boom)
    with pytest.raises(HTTPException) as exc:
        dep.cached_user_by_id("u1")
    assert exc.value.status_code == 503


def test_infra_error_with_stale_cache_uses_cached_row(monkeypatch) -> None:
    monkeypatch.setattr(dep, "get_user_by_id", lambda uid, supabase=None: {"id": uid, "role": "user"})
    dep.cached_user_by_id("u1")
    # expire the entry, then make the lookup fail
    with dep._user_cache_lock:
        exp, row = dep._user_cache["u1"]
        dep._user_cache["u1"] = (exp - 10_000, row)

    def boom(user_id, supabase=None):
        raise RuntimeError("timeout")

    monkeypatch.setattr(dep, "get_user_by_id", boom)
    assert dep.cached_user_by_id("u1")["role"] == "user"


def test_invalidate_forces_refetch(monkeypatch) -> None:
    roles = iter(["user", "admin"])
    monkeypatch.setattr(dep, "get_user_by_id", lambda uid, supabase=None: {"id": uid, "role": next(roles)})
    assert dep.cached_user_by_id("u1")["role"] == "user"
    dep.invalidate_user_cache("u1")
    assert dep.cached_user_by_id("u1")["role"] == "admin"

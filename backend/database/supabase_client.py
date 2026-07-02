"""
Supabase REST (PostgREST) wrapper.

Why REST:
- Supabase Python SDK pulls heavy optional deps that may require MSVC build tools on Windows.
- REST works with plain HTTP requests and still supports service-role server-side access.

Env vars:
- SUPABASE_URL=https://<project-ref>.supabase.co
- SUPABASE_SERVICE_ROLE_KEY=<service role key>
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import requests

# `database/` -> `backend/` (always load backend/.env before reading env vars)
_BACKEND_ROOT = Path(__file__).resolve().parent.parent
_ENV_BOOTSTRAPPED = False


def _parse_env_file(path: Path) -> None:
    """Fallback if python-dotenv isn't available or doesn't apply (UTF-8 KEY=VAL lines)."""
    if not path.is_file():
        return
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip().strip("\ufeff")  # strip BOM if editor added one
        val = val.strip().strip('"').strip("'")
        if not key:
            continue
        # Don't clobber explicit shell/env overrides
        if not os.getenv(key):
            os.environ[key] = val


def _bootstrap_backend_env() -> None:
    """Ensure `backend/.env` is loaded no matter how uvicorn was started."""
    global _ENV_BOOTSTRAPPED
    if _ENV_BOOTSTRAPPED:
        return
    env_path = _BACKEND_ROOT / ".env"
    try:
        from dotenv import load_dotenv

        # Never override explicit process env, but always import missing keys from backend/.env
        load_dotenv(env_path, encoding="utf-8", override=False)
    except Exception:
        pass
    # Always parse fallback too, so keys beyond SUPABASE_* (SMTP, JWT, etc.) are loaded.
    _parse_env_file(env_path)
    _ENV_BOOTSTRAPPED = True


def _env(name: str) -> str:
    _bootstrap_backend_env()
    val = os.getenv(name, "").strip()
    if not val:
        raise RuntimeError(f"Missing {name} env var in backend (.env)")
    return val


class SupabaseRest:
    def __init__(self, url: str, apikey: str, bearer_token: str):
        clean_url = url.strip().rstrip("/")
        if clean_url.endswith("/rest/v1"):
            clean_url = clean_url[: -len("/rest/v1")]
        self.rest_base = clean_url + "/rest/v1"
        self.headers = {
            "apikey": apikey,
            "Authorization": f"Bearer {bearer_token}",
            "Content-Type": "application/json",
        }
        self._session = requests.Session()
        self._session.headers.update(
            {
                "Connection": "keep-alive",
                "Accept-Encoding": "gzip, deflate",
            }
        )

    def _request(self, method: str, url: str, **kwargs: Any) -> requests.Response:
        headers = kwargs.pop("headers", None)
        merged = {**self.headers, **(headers or {})}
        return self._session.request(method, url, headers=merged, **kwargs)

    def _handle_response(self, resp: requests.Response) -> Any:
        try:
            resp.raise_for_status()
        except Exception as e:
            # Attempt to surface Supabase errors
            try:
                msg = resp.json()
            except Exception:
                msg = resp.text
            raise RuntimeError(f"Supabase request failed: {msg}") from e
        if not resp.text:
            return None
        # Supabase often returns JSON arrays
        return resp.json()

    def select(
        self,
        table: str,
        select: str = "*",
        where_eq: Optional[Dict[str, Any]] = None,
        where_gte: Optional[Dict[str, Any]] = None,
        where_lte: Optional[Dict[str, Any]] = None,
        order: Optional[str] = None,
        limit: Optional[int] = None,
        *,
        items_range: Optional[Tuple[int, int]] = None,
    ) -> List[Dict[str, Any]]:
        params: Dict[str, Any] = {"select": select}
        headers: Dict[str, str] = {**self.headers}
        # PostgREST: Range over item indices [lo..hi], inclusive — use instead of LIMIT for paging.
        if items_range is not None:
            lo, hi = items_range
            headers["Range-Unit"] = "items"
            headers["Range"] = f"{lo}-{hi}"
        if where_eq:
            for k, v in where_eq.items():
                params[k] = f"eq.{v}"
        if where_gte:
            for k, v in where_gte.items():
                # If column already has a value, convert to list to support multiple filters.
                if k in params:
                    existing = params[k]
                    params[k] = [existing] if not isinstance(existing, list) else existing
                    params[k].append(f"gte.{v}")
                else:
                    params[k] = f"gte.{v}"
        if where_lte:
            for k, v in where_lte.items():
                if k in params:
                    existing = params[k]
                    params[k] = [existing] if not isinstance(existing, list) else existing
                    params[k].append(f"lte.{v}")
                else:
                    params[k] = f"lte.{v}"
        if order:
            params["order"] = order
        if limit is not None and items_range is None:
            params["limit"] = limit

        resp = self._request(
            "GET",
            f"{self.rest_base}/{table}",
            headers=headers,
            params=params,
            timeout=30,
        )
        data = self._handle_response(resp)
        return data or []

    def count_rows(
        self,
        table: str,
        where_eq: Optional[Dict[str, Any]] = None,
        where_gte: Optional[Dict[str, Any]] = None,
        where_lte: Optional[Dict[str, Any]] = None,
    ) -> int:
        """Cheap row count via PostgREST `Prefer: count=exact` (no full payload)."""
        params: Dict[str, Any] = {"select": "id"}
        headers: Dict[str, str] = {
            **self.headers,
            "Prefer": "count=exact",
            "Range-Unit": "items",
            "Range": "0-0",
        }
        if where_eq:
            for k, v in where_eq.items():
                params[k] = f"eq.{v}"
        if where_gte:
            for k, v in where_gte.items():
                if k in params:
                    existing = params[k]
                    params[k] = [existing] if not isinstance(existing, list) else existing
                    params[k].append(f"gte.{v}")
                else:
                    params[k] = f"gte.{v}"
        if where_lte:
            for k, v in where_lte.items():
                if k in params:
                    existing = params[k]
                    params[k] = [existing] if not isinstance(existing, list) else existing
                    params[k].append(f"lte.{v}")
                else:
                    params[k] = f"lte.{v}"

        resp = self._request(
            "GET",
            f"{self.rest_base}/{table}",
            headers=headers,
            params=params,
            timeout=30,
        )
        self._handle_response(resp)
        content_range = resp.headers.get("Content-Range") or resp.headers.get("content-range") or ""
        if "/" in content_range:
            total = content_range.rsplit("/", 1)[-1].strip()
            if total.isdigit():
                return int(total)
        return 0

    def select_where_in(
        self,
        table: str,
        column: str,
        values: Iterable[Any],
        *,
        select: str = "*",
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        ids = [str(v).strip() for v in values if v is not None and str(v).strip()]
        if not ids:
            return []
        quoted = ",".join(ids)
        params: Dict[str, Any] = {"select": select, column: f"in.({quoted})"}
        if limit is not None:
            params["limit"] = limit
        resp = self._request(
            "GET",
            f"{self.rest_base}/{table}",
            headers=self.headers,
            params=params,
            timeout=30,
        )
        data = self._handle_response(resp)
        return data or []

    def insert_many(
        self,
        table: str,
        rows: List[Dict[str, Any]],
        return_representation: bool = False,
    ) -> List[Dict[str, Any]]:
        headers = dict(self.headers)
        if return_representation:
            headers["Prefer"] = "return=representation"

        resp = self._request(
            "POST",
            f"{self.rest_base}/{table}",
            headers=headers,
            json=rows,
            timeout=30,
        )
        data = self._handle_response(resp)
        return data or []

    def upsert_many(
        self,
        table: str,
        rows: List[Dict[str, Any]],
        on_conflict: str,
    ) -> List[Dict[str, Any]]:
        """
        Upsert via REST using Prefer: resolution=merge-duplicates
        Requires a unique constraint/index that matches on_conflict.
        """
        headers = dict(self.headers)
        headers["Prefer"] = "resolution=merge-duplicates,return=representation"
        params = {"on_conflict": on_conflict}

        resp = self._request(
            "POST",
            f"{self.rest_base}/{table}",
            headers=headers,
            params=params,
            json=rows,
            timeout=30,
        )
        data = self._handle_response(resp)
        return data or []

    def update_single(
        self,
        table: str,
        payload: Dict[str, Any],
        where_eq: Dict[str, Any],
        *,
        where_is_null: Optional[List[str]] = None,
    ) -> Optional[Dict[str, Any]]:
        # PATCH supports filtering in query string
        params: Dict[str, Any] = {"select": "*"}
        for k, v in where_eq.items():
            params[k] = f"eq.{v}"
        for col in where_is_null or []:
            if col.strip():
                params[col] = "is.null"

        headers = dict(self.headers)
        headers["Prefer"] = "return=representation"

        resp = self._request(
            "PATCH",
            f"{self.rest_base}/{table}",
            headers=headers,
            params=params,
            json=payload,
            timeout=30,
        )
        data = self._handle_response(resp)
        # Supabase returns list for patch, even when single
        if isinstance(data, list):
            return data[0] if data else None
        return data

    def delete_many(
        self,
        table: str,
        where_eq: Dict[str, Any],
    ) -> int:
        params: Dict[str, Any] = {}
        for k, v in where_eq.items():
            params[k] = f"eq.{v}"
        headers = dict(self.headers)
        headers["Prefer"] = "return=minimal"
        resp = self._request(
            "DELETE",
            f"{self.rest_base}/{table}",
            headers=headers,
            params=params,
            timeout=30,
        )
        self._handle_response(resp)
        return 1


@lru_cache(maxsize=1)
def get_supabase() -> SupabaseRest:
    # Backwards compatible: service-role client (RLS bypass)
    url = _env("SUPABASE_URL")
    service_role_key = _env("SUPABASE_SERVICE_ROLE_KEY")
    return SupabaseRest(url, apikey=service_role_key, bearer_token=service_role_key)


@lru_cache(maxsize=1)
def get_supabase_service() -> SupabaseRest:
    url = _env("SUPABASE_URL")
    service_role_key = _env("SUPABASE_SERVICE_ROLE_KEY")
    return SupabaseRest(url, apikey=service_role_key, bearer_token=service_role_key)


def get_supabase_user(access_token: str) -> SupabaseRest:
    # Auth is handled by FastAPI now, so Supabase access happens server-side with
    # service-role credentials after app-level JWT/role checks.
    url = _env("SUPABASE_URL")
    service_role_key = _env("SUPABASE_SERVICE_ROLE_KEY")
    return SupabaseRest(url, apikey=service_role_key, bearer_token=service_role_key)


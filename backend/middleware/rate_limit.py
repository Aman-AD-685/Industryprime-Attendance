"""
In-memory per-IP rate limiting for FastAPI.

Set RATE_LIMIT_ENABLED=true in production (default). For multi-instance Render, add Redis or edge limits later.
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

# path prefix -> (max requests, window seconds)
_STRICT_PREFIXES: Tuple[Tuple[str, int, int], ...] = (
    ("/auth/login", 20, 60),
    ("/login", 20, 60),
    ("/auth/refresh", 30, 60),
    ("/auth/signup", 12, 60),
    ("/auth/forgot-password", 10, 60),
    ("/leave/approve", 30, 60),
    ("/leave/reject", 30, 60),
)

# Session probe — separate bucket so dashboard traffic does not block login.
_AUTH_ME_PREFIX = "/auth/me"

_EXEMPT_PATHS = frozenset({"/", "/health", "/docs", "/openapi.json", "/redoc"})


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _normalize_path(path: str) -> str:
    return path.rstrip("/") or "/"


def _limits_for_path(path: str) -> Tuple[int, int]:
    if path == _AUTH_ME_PREFIX or path.startswith(_AUTH_ME_PREFIX + "/"):
        return 120, 60
    for prefix, limit, window in _STRICT_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return limit, window
    default = int(os.getenv("RATE_LIMIT_PER_MINUTE", "300"))
    return max(default, 60), 60


def _bucket_key(ip: str, path: str) -> str:
    """One counter per IP + route group (never share /auth/login with /auth/me)."""
    if path == _AUTH_ME_PREFIX or path.startswith(_AUTH_ME_PREFIX + "/"):
        return f"{ip}:auth:me"
    for prefix, _, _ in _STRICT_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return f"{ip}:{prefix}"
    return f"{ip}:api:default"


class _WindowCounter:
    def __init__(self) -> None:
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def allow(self, key: str, limit: int, window_sec: int) -> bool:
        now = time.monotonic()
        q = self._hits[key]
        cutoff = now - window_sec
        while q and q[0] < cutoff:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True


_counter = _WindowCounter()


def rate_limit_enabled() -> bool:
    return os.getenv("RATE_LIMIT_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}


def log_rate_limit_status() -> None:
    if rate_limit_enabled():
        default = int(os.getenv("RATE_LIMIT_PER_MINUTE", "300"))
        logger.info(
            "Rate limiting enabled (default %s req/min per IP; /auth/login 20/min; /auth/me 120/min).",
            default,
        )
    else:
        logger.warning("Rate limiting is DISABLED (RATE_LIMIT_ENABLED=false).")


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if not rate_limit_enabled():
            return await call_next(request)

        path = _normalize_path(request.url.path)
        if path in _EXEMPT_PATHS:
            return await call_next(request)

        ip = _client_ip(request)
        limit, window = _limits_for_path(path)
        bucket = _bucket_key(ip, path)
        if not _counter.allow(bucket, limit, window):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please wait a minute and try again."},
                headers={"Retry-After": str(window)},
            )
        return await call_next(request)

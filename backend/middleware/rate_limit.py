"""
In-memory per-IP rate limiting for FastAPI.

Production: set RATE_LIMIT_ENABLED=true. For multi-instance Render, prefer Redis or edge rate limits later.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

# path prefix -> (max requests, window seconds)
_STRICT_PREFIXES: Tuple[Tuple[str, int, int], ...] = (
    ("/auth/login", 15, 60),
    ("/login", 15, 60),
    ("/auth/signup", 10, 60),
    ("/auth/forgot-password", 10, 60),
    ("/leave/approve", 30, 60),
    ("/leave/reject", 30, 60),
)

_EXEMPT_PATHS = frozenset({"/", "/health", "/docs", "/openapi.json", "/redoc"})


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def _limits_for_path(path: str) -> Tuple[int, int]:
    for prefix, limit, window in _STRICT_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return limit, window
    default = int(os.getenv("RATE_LIMIT_PER_MINUTE", "300"))
    return default, 60


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


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        if not rate_limit_enabled():
            return await call_next(request)

        path = request.url.path.rstrip("/") or "/"
        if path in _EXEMPT_PATHS:
            return await call_next(request)

        ip = _client_ip(request)
        limit, window = _limits_for_path(path)
        bucket = f"{ip}:{path.split('/')[1] if path.startswith('/') else path}"
        if not _counter.allow(bucket, limit, window):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please try again later."},
                headers={"Retry-After": str(window)},
            )
        return await call_next(request)

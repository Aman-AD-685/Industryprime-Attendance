"""
HRIS API — FastAPI entrypoint (Phase 1: attendance upload + report).
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Always load env from this package's folder (`backend/.env`), not the shell CWD.
# Running `uvicorn main:app` from the repo root would otherwise miss `SUPABASE_URL`.
_BACKEND_DIR = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv

    load_dotenv(_BACKEND_DIR / ".env")
except Exception:
    pass

from routers import attendance
from routers.dashboard import router as dashboard_router
from routers.employees import router as employees_router
from routers.leave import router as leave_router
from routers.payroll import router as payroll_router
from routers.auth import router as auth_router
from routers.auth import LoginRequest, login as auth_login
from routers.months import router as months_router

app = FastAPI(
    title="HRIS API",
    description="Human Resource Information System — Phase 1 attendance",
    version="1.0.0",
)

_default_cors_origins = [
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "https://industryprime-attendance.vercel.app",
]
_env_cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
_frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
if _frontend_url:
    _env_cors_origins.append(_frontend_url)

# Allow local Next.js dev server and configured production frontend domains.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[*_default_cors_origins, *_env_cors_origins],
    # Local dev: any port on localhost / 127.0.0.1 / ::1 (Next default is often :3000).
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?|https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(attendance.router, prefix="/attendance", tags=["attendance"])
app.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
app.include_router(employees_router, prefix="/employees", tags=["employees"])
app.include_router(leave_router, prefix="/leave", tags=["leave"])
app.include_router(payroll_router, prefix="/payroll", tags=["payroll"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(months_router, prefix="/months", tags=["months"])


@app.get("/")
def root():
    return {"message": "API is running"}


@app.get("/login")
def login_probe():
    return {"message": "login endpoint is ready", "method": "POST"}


@app.post("/login")
def login_alias(payload: LoginRequest):
    return auth_login(payload)


@app.get("/health")
def health():
    return {"status": "ok"}


# Run with: `python main.py` from `backend/` (uses API_PORT from `.env`, default 8000).
# This matches `web/.env.local` → `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`.
if __name__ == "__main__":
    import os

    import uvicorn

    port = int(os.environ.get("API_PORT", "8000"))
    uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)

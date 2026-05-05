from __future__ import annotations

import hashlib
import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
)

from database.supabase_client import get_supabase, get_supabase_user
from dependencies.auth_dependency import AuthContext, get_auth_context
from schemas.attendance import AttendanceMonthOut, AttendanceUpdateIn, EmployeeAttendanceRowOut
from schemas.attendance_link import (
    AttendanceAddIn,
    AttendanceAddOut,
    AttendanceEntryEmployeeOut,
    AttendanceEntryMonthRowOut,
)
from services.attendance_link_entry_service import add_attendance_entry, list_entry_employees, list_entry_month
from services.attendance_management_service import ensure_month, update_attendance
from services.attendance_pdf_upload_service import (
    fetch_upload_result,
    insert_upload_placeholder,
    process_pdf_upload_job,
)

router = APIRouter()

MAX_PDF_BYTES = 5 * 1024 * 1024


def _parse_iso_ts(value: object) -> datetime:
    t = str(value).replace("Z", "+00:00")
    dt = datetime.fromisoformat(t)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def assert_valid_public_upload_token(raw: Optional[str]) -> None:
    """Raises 401 if token missing, unknown, or expired."""
    if not raw or not str(raw).strip():
        raise HTTPException(status_code=401, detail="Invalid or missing upload token")
    digest = hashlib.sha256(raw.strip().encode("utf-8")).hexdigest()
    rows = get_supabase().select(
        table="attendance_upload_tokens",
        select="expires_at",
        where_eq={"token_hash": digest},
        limit=1,
    )
    if not rows:
        raise HTTPException(status_code=401, detail="Invalid upload token")
    exp = _parse_iso_ts(rows[0]["expires_at"])
    if exp < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Upload token expired")


def _enqueue_pdf_job(
    *,
    background_tasks: BackgroundTasks,
    file_bytes: bytes,
    overwrite: bool,
    dry_run: bool,
) -> str:
    _require_pdf_magic(file_bytes)
    upload_id = uuid.uuid4()
    insert_upload_placeholder(get_supabase(), upload_id, overwrite=overwrite, dry_run=dry_run)

    def _run() -> None:
        try:
            process_pdf_upload_job(
                upload_id,
                file_bytes,
                overwrite=overwrite,
                dry_run=dry_run,
            )
        except Exception:
            get_supabase().update_single(
                table="attendance_upload_logs",
                payload={
                    "status": "failed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "error_details": {
                        "errors": [{"row": 0, "reason": "Unhandled server error during PDF processing"}],
                        "rows": [],
                    },
                },
                where_eq={"upload_id": str(upload_id)},
            )

    background_tasks.add_task(_run)
    return str(upload_id)


def _require_pdf_magic(data: bytes) -> None:
    if len(data) > MAX_PDF_BYTES:
        raise HTTPException(status_code=400, detail="PDF exceeds 5MB limit")
    if len(data) < 8 or not data[:5].startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="Expected a PDF file (application/pdf)")


def _assert_can_update_attendance(employee_id: str, auth: AuthContext) -> None:
    """Admins may edit anyone; other roles may only edit rows for their own employee record (by email)."""
    if auth.role in {"master_admin", "admin"}:
        return
    rows = get_supabase().select(
        table="employees",
        select="email",
        where_eq={"id": employee_id},
        limit=1,
    )
    emp = rows[0] if rows else {}
    if str(emp.get("email") or "").strip().lower() != auth.email.strip().lower():
        raise HTTPException(
            status_code=403,
            detail="You can only edit your own attendance. Ask an admin to change other employees.",
        )


def _auth_employee_access(employee_id: str, authorization: Optional[str]):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    if auth.role in {"master_admin", "admin"}:
        return auth
    rows = get_supabase_user(auth.access_token).select(
        table="employees",
        select="id,email",
        where_eq={"id": employee_id},
        limit=1,
    )
    employee = rows[0] if rows else {}
    if str(employee.get("email") or "").strip().lower() != auth.email.strip().lower():
        raise HTTPException(status_code=403, detail="You can only view your own attendance")
    return auth


# --- Public attendance entry (no JWT; optional ATTENDANCE_ENTRY_SECRET via ?key=) ---


@router.post("/add", response_model=AttendanceAddOut)
def post_public_attendance_add(body: AttendanceAddIn):
    """Public form: add one row per user+date into `attendance_link_entries`."""
    row = add_attendance_entry(body.model_dump(), supabase=get_supabase())
    return AttendanceAddOut(**row)


@router.get("/entry/employees", response_model=List[AttendanceEntryEmployeeOut])
def get_public_entry_employees(key: Optional[str] = Query(default=None)):
    """Minimal employee list for public attendance dropdown."""
    rows = list_entry_employees(get_supabase(), key=key)
    return [AttendanceEntryEmployeeOut(**r) for r in rows]


@router.get("/entry/month", response_model=List[AttendanceEntryMonthRowOut])
def get_public_entry_month(
    user_id: str = Query(..., description="employees.id"),
    month: int = Query(..., ge=1, le=12),
    year: int = Query(..., ge=2000, le=2100),
    key: Optional[str] = Query(default=None),
):
    rows = list_entry_month(user_id, month, year, key, supabase=get_supabase())
    return [AttendanceEntryMonthRowOut(**r) for r in rows]


@router.post("/upload-pdf", response_model=Dict[str, Any])
async def attendance_upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    dry_run: bool = Form(False),
    authorization: Optional[str] = Header(default=None),
):
    """Async PDF import (admin). Returns upload_id immediately; poll GET /upload-pdf/status/{upload_id}."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    if auth.role not in {"master_admin", "admin"}:
        raise HTTPException(status_code=403, detail="Only admins may upload attendance PDFs")
    content_type = (file.content_type or "").lower()
    if content_type and "pdf" not in content_type:
        raise HTTPException(status_code=400, detail="Content-Type must be application/pdf")
    raw = await file.read()
    upload_id = _enqueue_pdf_job(
        background_tasks=background_tasks,
        file_bytes=raw,
        overwrite=overwrite,
        dry_run=dry_run,
    )
    return {"upload_id": upload_id, "status": "processing"}


@router.get("/upload-pdf/status/{upload_id}", response_model=Dict[str, Any])
def attendance_upload_pdf_status(upload_id: str, authorization: Optional[str] = Header(default=None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    if auth.role not in {"master_admin", "admin"}:
        raise HTTPException(status_code=403, detail="Only admins may view upload status")
    data = fetch_upload_result(get_supabase(), upload_id)
    if not data:
        raise HTTPException(status_code=404, detail="Unknown upload_id")
    return data


@router.post("/public/upload-pdf", response_model=Dict[str, Any])
async def public_attendance_upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    token: str = Form(...),
    overwrite: bool = Form(False),
    dry_run: bool = Form(False),
):
    """Token-scoped PDF upload (public page only)."""
    assert_valid_public_upload_token(token)
    content_type = (file.content_type or "").lower()
    if content_type and "pdf" not in content_type:
        raise HTTPException(status_code=400, detail="Content-Type must be application/pdf")
    raw = await file.read()
    upload_id = _enqueue_pdf_job(
        background_tasks=background_tasks,
        file_bytes=raw,
        overwrite=overwrite,
        dry_run=dry_run,
    )
    return {"upload_id": upload_id, "status": "processing"}


@router.get("/public/upload-pdf/status/{upload_id}", response_model=Dict[str, Any])
def public_attendance_upload_pdf_status(
    upload_id: str,
    token: str = Query(..., description="Same token as upload form"),
):
    assert_valid_public_upload_token(token)
    data = fetch_upload_result(get_supabase(), upload_id)
    if not data:
        raise HTTPException(status_code=404, detail="Unknown upload_id")
    return data


@router.get("/{employee_id}", response_model=AttendanceMonthOut)
def get_employee_attendance(
    employee_id: str,
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    authorization: Optional[str] = Header(default=None),
):
    if employee_id in {"upload", "report", "update", "months", "add", "entry", "public"}:
        raise HTTPException(status_code=404, detail="Not found")
    auth = _auth_employee_access(employee_id, authorization)
    rows, holidays = ensure_month(
        employee_id=employee_id,
        month=month,
        year=year,
        supabase=get_supabase_user(auth.access_token),
    )
    return {
        "employee_id": employee_id,
        "month": month,
        "year": year,
        "rows": rows,
        "holidays": holidays,
    }


@router.post("/update", response_model=EmployeeAttendanceRowOut)
def update_employee_attendance(
    payload: AttendanceUpdateIn,
    authorization: Optional[str] = Header(default=None),
):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization bearer token")
    auth = get_auth_context(authorization=authorization)
    _assert_can_update_attendance(str(payload.employee_id), auth)
    return update_attendance(
        payload.model_dump(),
        supabase=get_supabase_user(auth.access_token),
    )

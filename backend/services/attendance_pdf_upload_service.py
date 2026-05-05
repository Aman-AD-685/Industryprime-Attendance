"""PDF attendance batch import: match employees, validate, persist, upload logs."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID

from fastapi import HTTPException

from database.supabase_client import SupabaseRest, get_supabase
from services.attendance_management_service import (
    calculate_attendance_row,
    ensure_month,
    _employee_email_lower,
    _hours_between,
    _parse_time,
    _stored_attendance_row,
)
from services.pdf_attendance_parse import PdfRowParse, parse_attendance_pdf

_WEEKEND_AUTO_PRESENT_EMAILS = frozenset({"adrija@industryprime.com"})


def _norm_emp_code(code: str) -> str:
    c = str(code).strip()
    if c.isdigit():
        return str(int(c))
    return c.lower()


def _load_employee_indexes(supabase: SupabaseRest) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, List[Dict[str, Any]]]]:
    rows = supabase.select(
        table="employees",
        select="id,employee_code,at_div_code,name,email",
        limit=10000,
    )
    by_div: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    by_code: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for r in rows or []:
        cd = _norm_emp_code(str(r.get("employee_code") or ""))
        if cd:
            by_code[cd].append(r)
        ad = str(r.get("at_div_code") or "").strip()
        if ad:
            by_div[_norm_emp_code(ad)].append(r)
    return by_div, by_code


def _match_employee(
    emp_code_pdf: str,
    by_div: Dict[str, List[Dict[str, Any]]],
    by_code: Dict[str, List[Dict[str, Any]]],
) -> Tuple[Optional[Dict[str, Any]], str]:
    """Returns (employee_record or None, status: matched|unmapped|duplicate)."""
    k = _norm_emp_code(emp_code_pdf)
    if k in by_div:
        lst = by_div[k]
        if len(lst) == 1:
            return lst[0], "matched"
        return None, "duplicate"
    if k in by_code:
        lst = by_code[k]
        if len(lst) == 1:
            return lst[0], "matched"
        return None, "duplicate"
    return None, "unmapped"


def _validate_in_out(day: date, in_time: Optional[str], out_time: Optional[str]) -> Tuple[bool, str]:
    del day  # reserved for future same-day rules
    if not in_time or not out_time:
        return False, "Missing in_time or out_time"
    tin = _parse_time(in_time)
    tout = _parse_time(out_time)
    if not tin or not tout:
        return False, "Invalid time format"
    try:
        _hours_between(tin, tout)
    except HTTPException:
        return False, "in_time must be before out_time"
    return True, ""


def _holiday_lookup(day: date, supabase: SupabaseRest) -> Optional[str]:
    try:
        r = supabase.select(
            table="holidays",
            select="name",
            where_eq={"holiday_date": day.isoformat()},
            limit=1,
        )
        if not r:
            return None
        return str(r[0].get("name") or "Holiday").strip()
    except Exception:
        return None


def cleanup_stale_pdf_tempfiles(upload_dir: str, max_age_seconds: float = 15 * 60) -> int:
    """Delete PDFs older than max_age_seconds. Returns deletion count."""
    import os

    deadline = datetime.now(timezone.utc).timestamp() - max_age_seconds
    removed = 0
    try:
        for name in os.listdir(upload_dir):
            if not name.endswith(".pdf"):
                continue
            path = os.path.join(upload_dir, name)
            try:
                if os.path.getmtime(path) < deadline:
                    os.unlink(path)
                    removed += 1
            except OSError:
                continue
    except OSError:
        pass
    return removed


def process_pdf_upload_job(
    upload_id: UUID,
    pdf_bytes: bytes,
    *,
    overwrite: bool,
    dry_run: bool,
    supabase: Optional[SupabaseRest] = None,
) -> None:
    sb = supabase or get_supabase()
    uid = str(upload_id)

    errors: List[Dict[str, Any]] = []
    row_results: List[Dict[str, Any]] = []
    failed_count = unmapped_count = dup_count = 0

    try:
        report_date, parsed_rows, excerpt = parse_attendance_pdf(pdf_bytes)
        sb.update_single(
            table="attendance_upload_logs",
            payload={
                "preview_text_truncated": excerpt[:8000],
                "total_rows": len(parsed_rows),
            },
            where_eq={"upload_id": uid},
        )

        if not report_date:
            errors.append({"row": 0, "reason": "Could not detect report date in PDF header"})
            failed_count += len(parsed_rows) or 1
            sb.update_single(
                table="attendance_upload_logs",
                payload={
                    "status": "completed",
                    "completed_at": datetime.now(timezone.utc).isoformat(),
                    "success_count": 0,
                    "failed_count": failed_count,
                    "unmapped_count": 0,
                    "duplicate_user_error_count": 0,
                    "error_details": {"errors": errors, "rows": row_results},
                },
                where_eq={"upload_id": uid},
            )
            return

        day = report_date
        holiday_name = _holiday_lookup(day, sb)
        by_div, by_code = _load_employee_indexes(sb)
        existing = sb.select(
            table="attendance",
            select="employee_id",
            where_eq={"date": day.isoformat()},
            limit=5000,
        )
        existing_ids = {str(r["employee_id"]) for r in (existing or [])}

        to_upsert: List[Dict[str, Any]] = []
        touched_employees: set[str] = set()

        for pr in parsed_rows:
            emp, match_st = _match_employee(pr.emp_code, by_div, by_code)
            user_label = str(emp.get("name") or emp.get("employee_code") or "") if emp else ""

            if match_st == "duplicate":
                dup_count += 1
                failed_count += 1
                errors.append({"row": pr.pdf_row_index, "reason": "DUPLICATE USER ERROR (multiple employees for code)"})
                row_results.append(
                    {
                        "row": pr.pdf_row_index,
                        "emp_code": pr.emp_code,
                        "user": user_label,
                        "in": pr.in_time or "",
                        "out": pr.out_time or "",
                        "status": "failed",
                    }
                )
                continue

            if match_st == "unmapped" or emp is None:
                unmapped_count += 1
                errors.append({"row": pr.pdf_row_index, "reason": "User not found (at_div_code / employee_code)"})
                row_results.append(
                    {
                        "row": pr.pdf_row_index,
                        "emp_code": pr.emp_code,
                        "user": "",
                        "in": pr.in_time or "",
                        "out": pr.out_time or "",
                        "status": "unmapped",
                    }
                )
                continue

            ok, reason = _validate_in_out(day, pr.in_time, pr.out_time)
            if not ok:
                failed_count += 1
                errors.append({"row": pr.pdf_row_index, "reason": reason})
                row_results.append(
                    {
                        "row": pr.pdf_row_index,
                        "emp_code": pr.emp_code,
                        "user": user_label,
                        "in": pr.in_time or "",
                        "out": pr.out_time or "",
                        "status": "failed",
                    }
                )
                continue

            eid = str(emp["id"])
            if not overwrite and eid in existing_ids:
                failed_count += 1
                errors.append({"row": pr.pdf_row_index, "reason": "Attendance exists for date (overwrite=false)"})
                row_results.append(
                    {
                        "row": pr.pdf_row_index,
                        "emp_code": pr.emp_code,
                        "user": user_label,
                        "in": pr.in_time or "",
                        "out": pr.out_time or "",
                        "status": "failed",
                    }
                )
                continue

            email_lower = _employee_email_lower(eid, sb)
            weekend_auto = email_lower in _WEEKEND_AUTO_PRESENT_EMAILS if email_lower else False
            row_in = {
                "employee_id": eid,
                "date": day.isoformat(),
                "in_time": pr.in_time,
                "out_time": pr.out_time,
            }
            calculated = calculate_attendance_row(day, row_in, weekend_auto_present=weekend_auto, holiday_name=holiday_name)
            if calculated.get("status") == "A":
                failed_count += 1
                errors.append({"row": pr.pdf_row_index, "reason": "Invalid attendance after rules (absent)"})
                row_results.append(
                    {
                        "row": pr.pdf_row_index,
                        "emp_code": pr.emp_code,
                        "user": user_label,
                        "in": pr.in_time or "",
                        "out": pr.out_time or "",
                        "status": "failed",
                    }
                )
                continue

            stored = _stored_attendance_row(row_in, calculated, source="pdf", upload_id=uid)
            row_results.append(
                {
                    "row": pr.pdf_row_index,
                    "emp_code": pr.emp_code,
                    "user": user_label,
                    "in": pr.in_time or "",
                    "out": pr.out_time or "",
                    "status": "success",
                }
            )

            if not dry_run:
                to_upsert.append(stored)
                touched_employees.add(eid)
                existing_ids.add(eid)

        if not dry_run and to_upsert:
            sb.upsert_many(table="attendance", rows=to_upsert, on_conflict="employee_id,date")
            for eid in touched_employees:
                ensure_month(eid, day.month, day.year, sb)

        success_count = sum(1 for r in row_results if r.get("status") == "success")

        sb.update_single(
            table="attendance_upload_logs",
            payload={
                "status": "completed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "total_rows": len(parsed_rows),
                "success_count": success_count,
                "failed_count": failed_count,
                "unmapped_count": unmapped_count,
                "duplicate_user_error_count": dup_count,
                "error_details": {"errors": errors, "rows": row_results},
            },
            where_eq={"upload_id": uid},
        )

    except Exception as exc:
        errors.append({"row": 0, "reason": str(exc)})
        sb.update_single(
            table="attendance_upload_logs",
            payload={
                "status": "failed",
                "completed_at": datetime.now(timezone.utc).isoformat(),
                "failed_count": len(errors),
                "error_details": {"errors": errors, "rows": row_results},
            },
            where_eq={"upload_id": uid},
        )


def insert_upload_placeholder(
    supabase: SupabaseRest,
    upload_id: UUID,
    *,
    overwrite: bool,
    dry_run: bool,
) -> None:
    supabase.insert_many(
        table="attendance_upload_logs",
        rows=[
            {
                "upload_id": str(upload_id),
                "status": "processing",
                "overwrite": overwrite,
                "dry_run": dry_run,
                "total_rows": 0,
                "success_count": 0,
                "failed_count": 0,
                "unmapped_count": 0,
                "duplicate_user_error_count": 0,
                "error_details": {"errors": [], "rows": []},
            },
        ],
    )


def fetch_upload_result(supabase: SupabaseRest, upload_id: str) -> Optional[Dict[str, Any]]:
    rows = supabase.select(
        table="attendance_upload_logs",
        select="*",
        where_eq={"upload_id": upload_id},
        limit=1,
    )
    if not rows:
        return None
    r = rows[0]
    details = r.get("error_details") or {}
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except json.JSONDecodeError:
            details = {}
    err_list = details.get("errors") or []
    return {
        "upload_id": upload_id,
        "status": r.get("status"),
        "total": r.get("total_rows") or 0,
        "success": r.get("success_count") or 0,
        "failed": r.get("failed_count") or 0,
        "unmapped": r.get("unmapped_count") or 0,
        "duplicate_user_errors": r.get("duplicate_user_error_count") or 0,
        "errors": err_list,
        "rows": details.get("rows") or [],
        "dry_run": r.get("dry_run"),
        "overwrite": r.get("overwrite"),
        "completed_at": r.get("completed_at"),
    }

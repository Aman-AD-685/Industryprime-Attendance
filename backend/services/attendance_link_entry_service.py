from __future__ import annotations

import calendar
import os
import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from database.supabase_client import SupabaseRest, get_supabase


def attendance_entry_secret() -> str:
    return os.getenv("ATTENDANCE_ENTRY_SECRET", "").strip()


def assert_attendance_entry_key(key: Optional[str]) -> None:
    secret = attendance_entry_secret()
    if not secret:
        return
    if (key or "").strip() != secret:
        raise HTTPException(status_code=401, detail="Invalid or missing attendance entry key")


_TIME_RE = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")


def _normalize_time(value: Optional[str]) -> Optional[str]:
    if value is None or str(value).strip() == "":
        return None
    text = str(value).strip()
    if not _TIME_RE.match(text):
        raise HTTPException(status_code=400, detail="Time must be HH:MM or HH:MM:SS")
    parts = text.split(":")
    h, m = int(parts[0]), int(parts[1])
    if h > 23 or m > 59:
        raise HTTPException(status_code=400, detail="Invalid time")
    sec = int(parts[2]) if len(parts) > 2 else 0
    if sec > 59:
        raise HTTPException(status_code=400, detail="Invalid time")
    return f"{h:02d}:{m:02d}:{sec:02d}"


def list_entry_employees(supabase: SupabaseRest, key: Optional[str] = None) -> List[Dict[str, Any]]:
    assert_attendance_entry_key(key)
    rows = supabase.select(
        table="employees",
        select="id,name,employee_code",
        where_eq=None,
        order="name.asc",
        limit=500,
    )
    out: List[Dict[str, Any]] = []
    for r in rows:
        eid = str(r.get("id") or "")
        if not eid:
            continue
        out.append(
            {
                "id": eid,
                "name": r.get("name"),
                "employee_code": str(r.get("employee_code") or ""),
            }
        )
    return out


def add_attendance_entry(
    payload: Dict[str, Any],
    supabase: Optional[SupabaseRest] = None,
) -> Dict[str, Any]:
    if supabase is None:
        supabase = get_supabase()
    assert_attendance_entry_key(payload.get("key"))

    user_id = str(payload.get("user_id") or "").strip()
    d = payload.get("date")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    if not isinstance(d, date):
        try:
            d = date.fromisoformat(str(d)[:10])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid date") from exc

    in_t = _normalize_time(payload.get("in_time"))
    out_t = _normalize_time(payload.get("out_time"))
    if not in_t and not out_t:
        raise HTTPException(status_code=400, detail="Provide at least IN time or OUT time")

    exists = supabase.select(
        table="employees",
        select="id",
        where_eq={"id": user_id},
        limit=1,
    )
    if not exists:
        raise HTTPException(status_code=404, detail="User not found")

    def _time_from_db(value: Any) -> Optional[str]:
        if value in (None, ""):
            return None
        text = str(value).strip().split(".")[0]
        if not text:
            return None
        return _normalize_time(text)

    existing = supabase.select(
        table="attendance_link_entries",
        select="id,in_time,out_time",
        where_eq={"user_id": user_id, "date": d.isoformat()},
        limit=1,
    )
    if existing:
        ex = existing[0]
        merged_in = in_t or _time_from_db(ex.get("in_time"))
        merged_out = out_t or _time_from_db(ex.get("out_time"))
        if not merged_in and not merged_out:
            raise HTTPException(status_code=400, detail="Provide at least IN time or OUT time")
        updated = supabase.update_single(
            table="attendance_link_entries",
            payload={
                "in_time": merged_in,
                "out_time": merged_out,
                "month": d.month,
                "year": d.year,
            },
            where_eq={"user_id": user_id, "date": d.isoformat()},
        )
        if not updated:
            raise HTTPException(status_code=500, detail="Failed to update attendance")
        return _serialize_entry_row(updated)

    row = {
        "user_id": user_id,
        "date": d.isoformat(),
        "in_time": in_t,
        "out_time": out_t,
        "month": d.month,
        "year": d.year,
    }
    inserted = supabase.insert_many(
        table="attendance_link_entries",
        rows=[row],
        return_representation=True,
    )
    if not inserted:
        raise HTTPException(status_code=500, detail="Failed to save attendance")
    saved = inserted[0]
    return _serialize_entry_row(saved)


def link_entries_by_date_for_month(
    user_id: str,
    month: int,
    year: int,
    supabase: SupabaseRest,
) -> Dict[str, Dict[str, Any]]:
    """
    Public Add Attendance rows for one employee/month, keyed by YYYY-MM-DD.
    Used to overlay IN/OUT on the main attendance sheet (no URL key; server-side only).
    """
    start = date(year, month, 1).isoformat()
    last_day = calendar.monthrange(year, month)[1]
    end = date(year, month, last_day).isoformat()
    try:
        rows = supabase.select(
            table="attendance_link_entries",
            select="date,in_time,out_time",
            where_eq={"user_id": str(user_id)},
            where_gte={"date": start},
            where_lte={"date": end},
            order="date.asc",
            limit=200,
        )
    except RuntimeError as exc:
        if "attendance_link_entries" in str(exc) or "schema cache" in str(exc).lower():
            return {}
        raise
    out: Dict[str, Dict[str, Any]] = {}
    for r in rows or []:
        raw = r.get("date")
        dk = str(raw)[:10] if raw is not None and len(str(raw)) >= 10 else ""
        if dk:
            out[dk] = r
    return out


def list_entry_month(
    user_id: str,
    month: int,
    year: int,
    key: Optional[str],
    supabase: Optional[SupabaseRest] = None,
) -> List[Dict[str, Any]]:
    if supabase is None:
        supabase = get_supabase()
    assert_attendance_entry_key(key)

    exists = supabase.select(
        table="employees",
        select="id",
        where_eq={"id": user_id},
        limit=1,
    )
    if not exists:
        raise HTTPException(status_code=404, detail="User not found")

    start = date(year, month, 1).isoformat()
    last_day = calendar.monthrange(year, month)[1]
    end = date(year, month, last_day).isoformat()

    try:
        rows = supabase.select(
            table="attendance_link_entries",
            select="date,in_time,out_time,created_at",
            where_eq={"user_id": user_id},
            where_gte={"date": start},
            where_lte={"date": end},
            order="date.asc",
            limit=200,
        )
    except RuntimeError as exc:
        if "attendance_link_entries" in str(exc) or "schema cache" in str(exc).lower():
            return []
        raise
    return [_serialize_month_row(r) for r in rows]


def _serialize_entry_row(row: Dict[str, Any]) -> Dict[str, Any]:
    def fmt_time(v: Any) -> Optional[str]:
        if v in (None, ""):
            return None
        if isinstance(v, str) and len(v) >= 5:
            return v[:5]
        return str(v)[:5] if v else None

    d = row.get("date")
    d_str = str(d)[:10] if d else ""
    if not d_str:
        raise HTTPException(status_code=500, detail="Invalid saved row")
    return {
        "id": str(row.get("id") or ""),
        "user_id": str(row.get("user_id") or ""),
        "date": date.fromisoformat(d_str),
        "in_time": fmt_time(row.get("in_time")),
        "out_time": fmt_time(row.get("out_time")),
        "month": int(row.get("month") or 0),
        "year": int(row.get("year") or 0),
    }


def _serialize_month_row(row: Dict[str, Any]) -> Dict[str, Any]:
    def fmt_time(v: Any) -> Optional[str]:
        if v in (None, ""):
            return None
        s = str(v)
        return s[:5] if len(s) >= 5 else s

    d = row.get("date")
    d_str = str(d)[:10] if d else ""
    if not d_str:
        raise HTTPException(status_code=500, detail="Invalid attendance row")
    created = row.get("created_at")
    if isinstance(created, datetime):
        created = created.isoformat()
    return {
        "date": date.fromisoformat(d_str),
        "in_time": fmt_time(row.get("in_time")),
        "out_time": fmt_time(row.get("out_time")),
        "created_at": str(created) if created else None,
    }

"""
Phase 2 attendance: `public.attendance` + `public.employees` (employee_id FK).

Excel upload resolves employee_code → employees.id, then upserts attendance rows.
"""

from __future__ import annotations

from datetime import date, datetime, time
from typing import Any, Dict, List, Optional, Tuple

from database.supabase_client import SupabaseRest


def _parse_pg_date(val: Any) -> date:
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, datetime):
        return val.date()
    s = str(val)
    return date.fromisoformat(s[:10])


def _parse_pg_time(val: Any) -> time:
    if isinstance(val, time):
        return val.replace(microsecond=0)
    if isinstance(val, datetime):
        return val.time().replace(microsecond=0)
    s = str(val).strip()
    if "T" in s:
        return datetime.fromisoformat(s.replace("Z", "+00:00")[:19]).time()
    # "HH:MM:SS" or "HH:MM:SS.micro"
    base = s.split(".")[0]
    parts = base.split(":")
    h, m = int(parts[0]), int(parts[1])
    sec = int(float(parts[2])) if len(parts) > 2 else 0
    return time(h, m, sec)


def find_employee_id_by_code(supabase: SupabaseRest, employee_code: str) -> Optional[str]:
    code = (employee_code or "").strip()
    if not code:
        return None
    rows = supabase.select(
        table="employees",
        select="id",
        where_eq={"employee_code": code},
        limit=1,
    )
    if not rows or not rows[0].get("id"):
        return None
    return str(rows[0]["id"])


def persist_upload_rows(
    supabase: SupabaseRest,
    rows: List[Dict[str, Any]],
) -> Tuple[int, List[str]]:
    """
    Upsert into public.attendance. Skips rows when employee_code is unknown.
    Returns (persisted_count, messages for skips / notes).
    """
    messages: List[str] = []
    payload: List[Dict[str, Any]] = []

    for r in rows:
        code = str(r.get("employee_code") or "").strip()
        eid = find_employee_id_by_code(supabase, code)
        if not eid:
            messages.append(f"Skipped: no employee for code {code!r}")
            continue

        d = r["date"]
        if not isinstance(d, date):
            d = _parse_pg_date(d)

        ci = r["check_in"]
        co = r["check_out"]
        ci_t = ci.time().replace(microsecond=0) if isinstance(ci, datetime) else _parse_pg_time(ci)
        co_t = co.time().replace(microsecond=0) if isinstance(co, datetime) else _parse_pg_time(co)

        st = str(r.get("status") or "")
        payload.append(
            {
                "employee_id": eid,
                "date": str(d),
                "check_in": ci_t.isoformat(),
                "check_out": co_t.isoformat(),
                "working_hours": float(r.get("working_hours") or 0),
                "status": st,
                "late_minutes": int(r.get("late_minutes") or 0),
                "overtime_hours": float(r.get("overtime_hours") or 0),
                "final_status": str(r.get("final_status") or "present"),
                "source": "excel",
            }
        )

    if not payload:
        return 0, messages

    supabase.upsert_many(
        table="attendance",
        rows=payload,
        on_conflict="employee_id,date",
    )
    return len(payload), messages


def fetch_attendance_report_rows(
    supabase: SupabaseRest,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """
    Load attendance with embedded employee_code for API shape.
    """
    rows = supabase.select(
        table="attendance",
        select=(
            "date,check_in,check_out,working_hours,status,late_minutes,overtime_hours,final_status,"
            "employees(employee_code)"
        ),
        order="date.desc",
        limit=limit,
    )

    out: List[Dict[str, Any]] = []
    for row in rows:
        nested = row.get("employees")
        if isinstance(nested, list) and nested:
            emp = nested[0]
        elif isinstance(nested, dict):
            emp = nested
        else:
            emp = {}
        code = str(emp.get("employee_code") or "")

        da = _parse_pg_date(row.get("date"))
        t_in = _parse_pg_time(row.get("check_in"))
        t_out = _parse_pg_time(row.get("check_out"))
        ci = datetime.combine(da, t_in)
        co = datetime.combine(da, t_out)

        out.append(
            {
                "employee_code": code,
                "date": da,
                "check_in": ci,
                "check_out": co,
                "status": str(row.get("status") or ""),
                "working_hours": float(row.get("working_hours") or 0),
                "late_minutes": int(row.get("late_minutes") or 0),
                "overtime_hours": float(row.get("overtime_hours") or 0),
                "final_status": str(row.get("final_status") or "present"),
            }
        )
    return out


def insert_raw_attendance_log(
    supabase: SupabaseRest,
    *,
    device_user_id: Optional[str],
    timestamp: Optional[datetime],
    device_id: Optional[str],
    raw_json: Optional[Dict[str, Any]] = None,
) -> None:
    row: Dict[str, Any] = {
        "device_user_id": device_user_id,
        "device_id": device_id,
    }
    if timestamp is not None:
        row["timestamp"] = timestamp.isoformat()
    if raw_json is not None:
        row["raw_json"] = raw_json

    supabase.insert_many(
        table="attendance_logs_raw",
        rows=[row],
        return_representation=False,
    )

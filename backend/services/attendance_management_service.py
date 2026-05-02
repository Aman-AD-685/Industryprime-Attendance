from __future__ import annotations

import calendar
from datetime import date, time
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from database.supabase_client import SupabaseRest
from services.attendance_link_entry_service import link_entries_by_date_for_month

# Employees in this set get empty Saturday + Sunday treated as Present (no punches).
_WEEKEND_AUTO_PRESENT_EMAILS = frozenset({"adrija@industryprime.com"})


def _holiday_labels_for_month(month: int, year: int, supabase: SupabaseRest) -> Dict[str, str]:
    start = date(year, month, 1).isoformat()
    end_d = calendar.monthrange(year, month)[1]
    end = date(year, month, end_d).isoformat()
    try:
        rows = supabase.select(
            table="holidays",
            select="holiday_date,name",
            where_gte={"holiday_date": start},
            where_lte={"holiday_date": end},
            order="holiday_date.asc",
            limit=100,
        )
    except RuntimeError as exc:
        msg = str(exc).lower()
        if "holidays" in msg or "schema cache" in msg:
            return {}
        raise
    out: Dict[str, str] = {}
    for r in rows or []:
        raw = r.get("holiday_date")
        dk = str(raw)[:10] if raw is not None else ""
        if dk:
            out[dk] = str(r.get("name") or "Holiday").strip()
    return out


def _employee_email_lower(employee_id: str, supabase: SupabaseRest) -> Optional[str]:
    rows = supabase.select(
        table="employees",
        select="email",
        where_eq={"id": employee_id},
        limit=1,
    )
    if not rows:
        return None
    raw = rows[0].get("email")
    if raw in (None, ""):
        return None
    return str(raw).strip().lower()


def _parse_time(value: Any) -> Optional[time]:
    if value in (None, ""):
        return None
    if isinstance(value, time):
        return value.replace(second=0, microsecond=0)
    text = str(value).strip()
    if not text:
        return None
    parts = text.split(":")
    return time(int(parts[0]), int(parts[1]) if len(parts) > 1 else 0)


def _format_time(value: Any) -> Optional[str]:
    parsed = _parse_time(value)
    if parsed is None:
        return None
    return parsed.strftime("%H:%M")


def _hours_between(start: time, end: time) -> float:
    start_minutes = start.hour * 60 + start.minute
    end_minutes = end.hour * 60 + end.minute
    if end_minutes <= start_minutes:
        raise HTTPException(status_code=400, detail="Out time must be greater than In time")
    return round((end_minutes - start_minutes) / 60, 2)


def _actual_hours(out_time: time) -> float:
    start = time(9, 0)
    start_minutes = start.hour * 60 + start.minute
    out_minutes = out_time.hour * 60 + out_time.minute
    return round(max(0, out_minutes - start_minutes) / 60, 2)


def _required_hours(day: date) -> float:
    if day.weekday() == 5:
        return 5.0
    if day.weekday() == 6:
        return 0.0
    return 9.0


def _scheduled_hours_full_day(day: date, weekend_auto_present: bool) -> float:
    """
    Target hours for shortfall / OT on full IN+OUT rows.
    Saturday = 5h (9:00–14:00) for everyone except Adrija (weekend_auto_present), who keeps 9h.
    """
    if day.weekday() == 5:
        return 9.0 if weekend_auto_present else 5.0
    return 9.0


# Clock-in strictly after this (local time) counts as late for all employees.
_LATE_CUTOFF_MINUTES = 9 * 60 + 30  # 9:30 AM


def _time_to_minutes(t: time) -> int:
    return t.hour * 60 + t.minute


def _late_hours_after_cutoff(in_time: time) -> float:
    delta = _time_to_minutes(in_time) - _LATE_CUTOFF_MINUTES
    if delta <= 0:
        return 0.0
    return round(delta / 60, 2)


def calculate_attendance_row(
    day: date,
    row: Dict[str, Any],
    *,
    weekend_auto_present: bool = False,
    holiday_name: Optional[str] = None,
) -> Dict[str, Any]:
    in_time = _parse_time(row.get("in_time"))
    out_time = _parse_time(row.get("out_time"))
    is_saturday = day.weekday() == 5
    is_sunday = day.weekday() == 6

    if holiday_name and not in_time and not out_time:
        return {
            **row,
            "date": day.isoformat(),
            "in_time": None,
            "out_time": None,
            "total_hours": 0,
            "working_hours": 0,
            "actual_hours": 0,
            "shortfall": 0,
            "status": "P",
            "present": "P",
            "absent": "",
            "late_time": 0,
            "time_value": 0,
            "status_ot_sf": holiday_name,
            "use_calculated_calendar": True,
        }

    if weekend_auto_present and (is_saturday or is_sunday) and not in_time and not out_time:
        label = "Saturday" if is_saturday else "Sunday"
        return {
            **row,
            "date": day.isoformat(),
            "in_time": None,
            "out_time": None,
            "total_hours": 0,
            "working_hours": 0,
            "actual_hours": 0,
            "shortfall": 0,
            "status": "P",
            "present": "P",
            "absent": "",
            "late_time": 0,
            "time_value": 0,
            "status_ot_sf": label,
            "use_calculated_calendar": True,
        }

    if is_sunday and not in_time and not out_time:
        return {
            **row,
            "date": day.isoformat(),
            "in_time": None,
            "out_time": None,
            "total_hours": 0,
            "working_hours": 0,
            "actual_hours": 0,
            "shortfall": 0,
            "status": "P",
            "present": "P",
            "absent": "",
            "late_time": 0,
            "time_value": 0,
            "status_ot_sf": "Sunday",
            "use_calculated_calendar": True,
        }

    # Any date: IN without OUT counts as Present (P); clock-in after 9:30 → Late.
    if in_time and not out_time:
        late_time = _late_hours_after_cutoff(in_time)
        status_ot_sf = "Late" if late_time > 0 else "OK"
        return {
            **row,
            "date": day.isoformat(),
            "in_time": _format_time(in_time),
            "out_time": None,
            "total_hours": 0,
            "working_hours": 0,
            "actual_hours": 0,
            "shortfall": 0,
            "status": "P",
            "present": "P",
            "absent": "",
            "late_time": late_time,
            "time_value": 0,
            "status_ot_sf": status_ot_sf,
            "use_calculated_calendar": True,
        }

    if not in_time or not out_time:
        return {
            **row,
            "date": day.isoformat(),
            "in_time": _format_time(in_time),
            "out_time": _format_time(out_time),
            "working_hours": 0,
            "actual_hours": 0,
            "shortfall": _required_hours(day),
            "status": "A",
            "present": "",
            "absent": "A",
            "late_time": 0,
            "time_value": 0,
            "status_ot_sf": "Absent",
        }

    scheduled = _scheduled_hours_full_day(day, weekend_auto_present)
    working = _hours_between(in_time, out_time)
    actual = _actual_hours(out_time)
    shortfall = round(max(0, scheduled - actual), 2)
    late_time = _late_hours_after_cutoff(in_time)
    base_status = "OT" if actual > scheduled else ("SF" if shortfall > 0 else "OK")
    status_ot_sf = "Late" if late_time > 0 else base_status

    return {
        **row,
        "date": day.isoformat(),
        "in_time": _format_time(in_time),
        "out_time": _format_time(out_time),
        "working_hours": working,
        "actual_hours": actual,
        "shortfall": shortfall,
        "status": "P",
        "present": "P",
        "absent": "",
        "late_time": late_time,
        "time_value": actual,
        "status_ot_sf": status_ot_sf,
        "scheduled_hours": scheduled,
    }


def _blank_row(employee_id: str, day: date) -> Dict[str, Any]:
    return {
        "employee_id": employee_id,
        "date": day.isoformat(),
        "in_time": None,
        "out_time": None,
        "in_location": None,
        "out_location": None,
    }


def _stored_attendance_row(row: Dict[str, Any], calculated: Dict[str, Any]) -> Dict[str, Any]:
    actual_hours = float(row.get("actual_hours") if row.get("actual_hours") is not None else calculated["actual_hours"])
    working_hours = float(row.get("working_hours") if row.get("working_hours") is not None else calculated["working_hours"])
    late_time = float(row.get("late_time") if row.get("late_time") is not None else calculated["late_time"])
    status = str(row.get("status") or calculated["status"])
    status_ot_sf = str(row.get("status_ot_sf") or calculated["status_ot_sf"])
    sched = float(calculated.get("scheduled_hours") or 9)
    overtime_hours = max(0, actual_hours - sched)
    return {
        "employee_id": row["employee_id"],
        "date": str(row["date"])[:10],
        "check_in": calculated.get("in_time"),
        "check_out": calculated.get("out_time"),
        "working_hours": working_hours,
        "status": status,
        "late_minutes": int(late_time * 60),
        "overtime_hours": round(overtime_hours, 2),
        "final_status": status_ot_sf,
        "source": "manual",
    }


def ensure_month(
    employee_id: str, month: int, year: int, supabase: SupabaseRest
) -> Tuple[List[Dict[str, Any]], Dict[str, str]]:
    start = date(year, month, 1)
    end_day = calendar.monthrange(year, month)[1]
    end = date(year, month, end_day)

    existing = supabase.select(
        table="attendance",
        select="*",
        where_eq={"employee_id": employee_id},
        where_gte={"date": start.isoformat()},
        where_lte={"date": end.isoformat()},
        order="date.asc",
    )
    by_date = {str(row.get("date"))[:10]: row for row in existing}
    link_by_date = link_entries_by_date_for_month(employee_id, month, year, supabase)
    email_lower = _employee_email_lower(employee_id, supabase)
    weekend_auto = email_lower in _WEEKEND_AUTO_PRESENT_EMAILS if email_lower else False
    holiday_labels = _holiday_labels_for_month(month, year, supabase)

    month_rows: List[Dict[str, Any]] = []
    for day_num in range(1, end_day + 1):
        day = date(year, month, day_num)
        dk = day.isoformat()
        base: Dict[str, Any] = dict(by_date.get(dk) or _blank_row(employee_id, day))
        link = link_by_date.get(dk)
        if link:
            if link.get("in_time") not in (None, ""):
                base["in_time"] = link["in_time"]
                base["check_in"] = link["in_time"]
            if link.get("out_time") not in (None, ""):
                base["out_time"] = link["out_time"]
                base["check_out"] = link["out_time"]
        month_rows.append(base)

    rows = [
        serialize_attendance_row(
            row,
            weekend_auto_present=weekend_auto,
            holiday_name=holiday_labels.get(str(row.get("date"))[:10]),
        )
        for row in month_rows
    ]
    store_month_snapshot(employee_id, month, year, rows, supabase)
    return rows, holiday_labels


def serialize_attendance_row(
    row: Dict[str, Any],
    *,
    weekend_auto_present: bool = False,
    holiday_name: Optional[str] = None,
) -> Dict[str, Any]:
    day = date.fromisoformat(str(row["date"])[:10])
    normalized = {
        **row,
        "in_time": row.get("in_time") or row.get("check_in"),
        "out_time": row.get("out_time") or row.get("check_out"),
    }
    calculated = calculate_attendance_row(
        day,
        normalized,
        weekend_auto_present=weekend_auto_present,
        holiday_name=holiday_name,
    )
    if calculated.get("use_calculated_calendar"):
        total_hours = calculated["total_hours"] if calculated.get("total_hours") is not None else _required_hours(day)
        working_hours = calculated["working_hours"]
        actual_hours = calculated["actual_hours"]
        late_time = calculated["late_time"]
        status = calculated["status"]
        status_ot_sf = calculated["status_ot_sf"]
    else:
        if row.get("total_hours") is not None:
            total_hours = row.get("total_hours")
        elif calculated.get("total_hours") is not None:
            total_hours = calculated["total_hours"]
        else:
            total_hours = _required_hours(day)
        working_hours = row.get("working_hours") if row.get("working_hours") is not None else calculated["working_hours"]
        actual_hours = row.get("actual_hours") if row.get("actual_hours") is not None else calculated["actual_hours"]
        late_time = row.get("late_time")
        if late_time is None and row.get("late_minutes") is not None:
            late_time = float(row.get("late_minutes") or 0) / 60
        if late_time is None:
            late_time = calculated["late_time"]
        status = row.get("status") or calculated["status"]
        status_ot_sf = row.get("status_ot_sf") or row.get("final_status") or calculated["status_ot_sf"]
    return {
        "id": row.get("id"),
        "employee_id": row.get("employee_id"),
        "day": day.strftime("%A"),
        "date": day.isoformat(),
        "in_time": calculated.get("in_time"),
        "in_location": row.get("in_location"),
        "out_time": calculated.get("out_time"),
        "out_location": row.get("out_location"),
        "total_hours": float(total_hours) if total_hours is not None else 0.0,
        "working_hours": float(working_hours),
        "actual_hours": float(actual_hours),
        "shortfall": calculated["shortfall"],
        "present": "P" if status == "P" else "",
        "absent": "A" if status == "A" else "",
        "late_time": float(late_time),
        "time_value": float(row.get("time_value") or calculated["time_value"]),
        "status": status,
        "status_ot_sf": status_ot_sf,
    }


def update_attendance(payload: Dict[str, Any], supabase: SupabaseRest) -> Dict[str, Any]:
    employee_id = str(payload["employee_id"])
    day = date.fromisoformat(str(payload["date"])[:10])
    row = {
        "employee_id": employee_id,
        "date": day.isoformat(),
        "in_time": _format_time(payload.get("in_time")),
        "out_time": _format_time(payload.get("out_time")),
        "total_hours": payload.get("total_hours"),
        "working_hours": payload.get("working_hours"),
        "actual_hours": payload.get("actual_hours"),
        "shortfall": payload.get("shortfall"),
        "status": payload.get("status"),
        "late_time": payload.get("late_time"),
        "time_value": payload.get("time_value"),
        "status_ot_sf": payload.get("status_ot_sf"),
    }
    holiday_labels = _holiday_labels_for_month(day.month, day.year, supabase)
    holiday_name = holiday_labels.get(day.isoformat())
    email_lower = _employee_email_lower(employee_id, supabase)
    weekend_auto = email_lower in _WEEKEND_AUTO_PRESENT_EMAILS if email_lower else False
    calculated = calculate_attendance_row(
        day,
        row,
        weekend_auto_present=weekend_auto,
        holiday_name=holiday_name,
    )
    if calculated.get("in_time") and (
        calculated.get("out_time") or calculated.get("use_calculated_calendar")
    ):
        supabase.upsert_many(
            table="attendance",
            rows=[_stored_attendance_row(row, calculated)],
            on_conflict="employee_id,date",
        )
    month_rows, _ = ensure_month(employee_id, day.month, day.year, supabase)
    return next(item for item in month_rows if item["date"] == day.isoformat())


def list_months(employee_id: str, supabase: SupabaseRest) -> List[Dict[str, int]]:
    current = date.today()
    months = {(current.year, current.month)}
    try:
        rows = supabase.select(
            table="monthly_attendance",
            select="month,year",
            where_eq={"employee_id": employee_id},
            order="year.desc,month.desc",
        )
    except RuntimeError as exc:
        if "monthly_attendance" in str(exc) or "schema cache" in str(exc):
            return [{"year": current.year, "month": current.month}]
        raise
    for row in rows:
        months.add((int(row["year"]), int(row["month"])))
    try:
        link_rows = supabase.select(
            table="attendance_link_entries",
            select="month,year",
            where_eq={"employee_id": employee_id},
            limit=500,
        )
        for row in link_rows or []:
            if row.get("year") is not None and row.get("month") is not None:
                months.add((int(row["year"]), int(row["month"])))
    except RuntimeError as exc:
        if "attendance_link_entries" not in str(exc) and "schema cache" not in str(exc).lower():
            raise
    return [{"year": year, "month": month} for year, month in sorted(months, reverse=True)]


def store_month_snapshot(
    employee_id: str,
    month: int,
    year: int,
    rows: List[Dict[str, Any]],
    supabase: SupabaseRest,
) -> None:
    try:
        supabase.upsert_many(
            table="monthly_attendance",
            rows=[
                {
                    "employee_id": employee_id,
                    "month": month,
                    "year": year,
                    "stored_data": rows,
                }
            ],
            on_conflict="employee_id,month,year",
        )
    except RuntimeError as exc:
        if "monthly_attendance" in str(exc) or "schema cache" in str(exc):
            return
        raise

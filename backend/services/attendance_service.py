"""
Excel parsing, validation, working-hours calculation, and attendance rules engine.
"""

from datetime import date, datetime, time, timedelta
from io import BytesIO
from typing import Any, Dict, List, Tuple

import pandas as pd
from services.working_hours import calculate_working_hours, hhmm_value_to_minutes, minutes_to_hhmm_float

# Expected column names in the uploaded Excel (case-insensitive match)
REQUIRED_COLUMNS = [
    "employee_code",
    "date",
    "check_in",
    "check_out",
    "status",
]

# Business rule: late if check-in after this local time
LATE_THRESHOLD = time(9, 30)
REGULAR_DAY_HOURS = 9.0
HALF_DAY_MAX_HOURS = 4.0


def _normalize_column_name(name: str) -> str:
    return str(name).strip().lower().replace(" ", "_")


def _parse_date(val: Any) -> date:
    if pd.isna(val):
        raise ValueError("date is empty")
    if isinstance(val, datetime):
        return val.date()
    if isinstance(val, date):
        return val
    ts = pd.to_datetime(val, errors="coerce")
    if pd.isna(ts):
        raise ValueError(f"invalid date: {val!r}")
    return ts.date()


def _combine_day_time(d: date, t: Any) -> datetime:
    """Build datetime from calendar date + time-like value (Excel serial, datetime, or str)."""
    if pd.isna(t):
        raise ValueError("time value is empty")
    # Excel often stores full datetime in one cell — use as-is
    if isinstance(t, datetime):
        return t
    if isinstance(t, time):
        return datetime.combine(d, t)
    # Excel time can be float fraction of day
    if isinstance(t, (int, float)):
        whole = int(t)
        frac = float(t) - whole
        if whole > 40000:  # likely Excel serial datetime
            base = pd.Timestamp("1899-12-30") + pd.Timedelta(days=whole)
            day = base.date()
            seconds = int(round(frac * 86400)) if frac else 0
            tt = (datetime.min + timedelta(seconds=seconds)).time()
            return datetime.combine(day, tt)
        # fraction-of-day only
        seconds = int(round(float(t) * 86400))
        tt = (datetime.min + timedelta(seconds=seconds)).time()
        return datetime.combine(d, tt)
    ts = pd.to_datetime(str(t), errors="coerce")
    if pd.isna(ts):
        raise ValueError(f"invalid time: {t!r}")
    return datetime.combine(d, ts.time())


def _working_hours(check_in: datetime, check_out: datetime) -> float:
    return calculate_working_hours(check_in.time(), check_out.time())


def late_minutes_after_threshold(check_in: datetime, threshold: time = LATE_THRESHOLD) -> int:
    """Minutes late after threshold on the same calendar day as check_in."""
    limit = datetime.combine(check_in.date(), threshold)
    if check_in <= limit:
        return 0
    return int((check_in - limit).total_seconds() // 60)


def overtime_hours(working_h: float, regular: float = REGULAR_DAY_HOURS) -> float:
    working_minutes = hhmm_value_to_minutes(working_h)
    regular_minutes = int(round(regular * 60))
    if working_minutes <= regular_minutes:
        return 0.0
    return minutes_to_hhmm_float(working_minutes - regular_minutes)


def apply_attendance_rules(
    check_in: datetime,
    working_h: float,
) -> Tuple[int, float, str]:
    """
    Rules:
    - Late if check_in > 9:30 AM → late_minutes
    - Half day if working_hours < 4 → final_status half_day
    - Overtime if working_hours > 9 → overtime_hours
    Returns: (late_minutes, overtime_hours, final_status)
    """
    late = late_minutes_after_threshold(check_in)
    ot = overtime_hours(working_h)

    working_minutes = hhmm_value_to_minutes(working_h)
    if working_minutes < int(round(HALF_DAY_MAX_HOURS * 60)):
        return late, ot, "half_day"
    if late > 0 and ot > 0:
        return late, ot, "late_overtime"
    if ot > 0:
        return late, ot, "overtime"
    if late > 0:
        return late, ot, "late"
    return late, ot, "present"


def _validate_row(
    employee_code: Any,
    d: date,
    check_in: datetime,
    check_out: datetime,
    status: Any,
) -> Tuple[str, str]:
    code = str(employee_code).strip()
    if not code:
        raise ValueError("employee_code is required")
    if check_out <= check_in:
        check_out = check_out + timedelta(days=1)
    st = "" if pd.isna(status) else str(status).strip()
    return code, st


def parse_and_enrich_attendance_excel(file_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Read .xlsx from bytes, validate columns and rows, compute working_hours and rule fields.
    """
    df = pd.read_excel(BytesIO(file_bytes), engine="openpyxl")
    df.columns = [_normalize_column_name(c) for c in df.columns]

    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}. Found: {list(df.columns)}")

    df = df[REQUIRED_COLUMNS].copy()
    rows_out: List[Dict[str, Any]] = []

    for idx, row in df.iterrows():
        try:
            d = _parse_date(row["date"])
            ci = _combine_day_time(d, row["check_in"])
            co = _combine_day_time(d, row["check_out"])
            code, st = _validate_row(row["employee_code"], d, ci, co, row["status"])
            wh = _working_hours(ci, co)
            late_m, ot_h, final = apply_attendance_rules(ci, wh)
            rows_out.append(
                {
                    "employee_code": code,
                    "date": d,
                    "check_in": ci,
                    "check_out": co,
                    "status": st,
                    "working_hours": wh,
                    "late_minutes": late_m,
                    "overtime_hours": ot_h,
                    "final_status": final,
                }
            )
        except Exception as e:
            raise ValueError(f"Row {int(idx) + 2}: {e}") from e

    return rows_out


def mock_report_rows() -> List[Dict[str, Any]]:
    """Sample data for GET /attendance/report until DB is wired."""
    base = date.today()
    samples = [
        ("EMP001", base, time(9, 0), time(18, 0), "OK", "present"),
        # Late + >9h → late_overtime
        ("EMP002", base, time(10, 15), time(20, 0), "OK", "late_overtime"),
        ("EMP003", base, time(9, 30), time(13, 0), "Leave half", "half_day"),
    ]
    out: List[Dict[str, Any]] = []
    for code, d, tin, tout, status, _ in samples:
        ci = datetime.combine(d, tin)
        co = datetime.combine(d, tout)
        wh = _working_hours(ci, co)
        late_m, ot_h, final = apply_attendance_rules(ci, wh)
        out.append(
            {
                "employee_code": code,
                "date": d,
                "check_in": ci,
                "check_out": co,
                "status": status,
                "working_hours": wh,
                "late_minutes": late_m,
                "overtime_hours": ot_h,
                "final_status": final,
            }
        )
    return out

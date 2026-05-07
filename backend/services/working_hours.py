from __future__ import annotations

from datetime import datetime, time
from typing import Any, Optional

SHIFT_START = time(9, 0)


def parse_time_like(value: Any) -> Optional[time]:
    """Parse common time inputs into `time`, else return None."""
    if value is None:
        return None
    if isinstance(value, time):
        return value.replace(second=0, microsecond=0)
    if isinstance(value, datetime):
        t = value.time()
        return t.replace(second=0, microsecond=0)

    text = str(value).strip()
    if not text:
        return None

    # Supports: 9:00, 09:00, HH:mm:ss, 9:00 AM
    for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M:%S %p"):
        try:
            return datetime.strptime(text.upper(), fmt).time().replace(second=0, microsecond=0)
        except ValueError:
            continue
    return None


def calculate_working_minutes(in_time: Any, out_time: Any, shift_start: time = SHIFT_START) -> int:
    """Return working duration in minutes using effective start max(IN, 09:00)."""
    tin = parse_time_like(in_time)
    tout = parse_time_like(out_time)
    if tin is None or tout is None:
        return 0

    effective_in_minutes = max(tin.hour * 60 + tin.minute, shift_start.hour * 60 + shift_start.minute)
    out_minutes = tout.hour * 60 + tout.minute
    if out_minutes <= effective_in_minutes:
        return 0
    return out_minutes - effective_in_minutes


def minutes_to_hhmm_float(total_minutes: int) -> float:
    """538 -> 8.58 (HH.MM style, minutes not decimal fraction)."""
    if total_minutes <= 0:
        return 0.0
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return float(f"{hours}.{minutes:02d}")


def minutes_to_hhmm_display(total_minutes: int) -> str:
    """538 -> '8.58'."""
    if total_minutes <= 0:
        return "0.00"
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"{hours}.{minutes:02d}"


def hhmm_value_to_minutes(value: Any) -> int:
    """Convert HH.MM-style number/string back to minutes safely."""
    if value in (None, ""):
        return 0
    text = str(value).strip()
    if not text:
        return 0
    if "." not in text:
        try:
            return max(0, int(float(text)) * 60)
        except (TypeError, ValueError):
            return 0
    left, right = text.split(".", 1)
    try:
        hours = int(left or "0")
    except ValueError:
        return 0
    mm_text = "".join(ch for ch in right if ch.isdigit())
    if not mm_text:
        minutes = 0
    elif len(mm_text) == 1:
        minutes = int(mm_text) * 10
    else:
        minutes = int(mm_text[:2])
    if minutes >= 60:
        minutes = 59
    return max(0, hours * 60 + minutes)


def calculate_working_hours(in_time: Any, out_time: Any, shift_start: time = SHIFT_START) -> float:
    """Return HH.MM-style float for backward compatibility in numeric fields."""
    return minutes_to_hhmm_float(calculate_working_minutes(in_time, out_time, shift_start))


# Camel-case alias to match business requirement naming.
def calculateWorkingHours(in_time: Any, out_time: Any) -> float:
    return calculate_working_hours(in_time, out_time)


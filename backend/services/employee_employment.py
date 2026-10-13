from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional, Tuple

EMPLOYMENT_CURRENT = "current"
EMPLOYMENT_LEFT = "left"


def is_employee_visible_for_month(
    employee: Dict[str, Any],
    month: int,
    year: int,
) -> bool:
    """
    Not visible before the joining month (when joining_date is set).
    Current employees always visible otherwise.
    Left employees visible through left_effective month/year; hidden from the next month onward.
    """
    joined = str(employee.get("joining_date") or "")[:7]
    if joined and joined > f"{int(year):04d}-{int(month):02d}":
        return False
    status = str(employee.get("employment_status") or EMPLOYMENT_CURRENT).strip().lower()
    if status != EMPLOYMENT_LEFT:
        return True
    left_m = employee.get("left_effective_month")
    left_y = employee.get("left_effective_year")
    if left_m is None or left_y is None:
        return False
    ly, lm = int(left_y), int(left_m)
    if year < ly:
        return True
    if year > ly:
        return False
    return int(month) <= lm


def filter_employees_for_month(
    employees: List[Dict[str, Any]],
    month: int,
    year: int,
) -> List[Dict[str, Any]]:
    return [row for row in employees or [] if is_employee_visible_for_month(row, month, year)]


def employment_status_patch_payload(status: str, *, today: Optional[date] = None) -> Dict[str, Any]:
    """Left = salary counts through today (left_date); hidden from the month after."""
    clean = str(status or "").strip().lower()
    if clean not in {EMPLOYMENT_CURRENT, EMPLOYMENT_LEFT}:
        raise ValueError("employment_status must be 'current' or 'left'")
    if clean == EMPLOYMENT_LEFT:
        d = today or date.today()
        return {
            "employment_status": EMPLOYMENT_LEFT,
            "left_effective_month": d.month,
            "left_effective_year": d.year,
            "left_date": d.isoformat(),
        }
    return {
        "employment_status": EMPLOYMENT_CURRENT,
        "left_effective_month": None,
        "left_effective_year": None,
        "left_date": None,
    }


def _parse_date(raw: Any) -> Optional[date]:
    if raw in (None, ""):
        return None
    try:
        return date.fromisoformat(str(raw)[:10])
    except ValueError:
        return None


def employment_period_by_employee(
    employees: List[Dict[str, Any]],
) -> Tuple[Dict[str, date], Dict[str, date]]:
    """({employee_id: joining_date}, {employee_id: left_date}) for rows that have them set."""
    starts: Dict[str, date] = {}
    ends: Dict[str, date] = {}
    for emp in employees or []:
        eid = str(emp.get("id") or "")
        if not eid:
            continue
        jd = _parse_date(emp.get("joining_date"))
        if jd is not None:
            starts[eid] = jd
        if str(emp.get("employment_status") or "").strip().lower() == EMPLOYMENT_LEFT:
            ld = _parse_date(emp.get("left_date"))
            if ld is not None:
                ends[eid] = ld
    return starts, ends

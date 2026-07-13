from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional

EMPLOYMENT_CURRENT = "current"
EMPLOYMENT_LEFT = "left"


def is_employee_visible_for_month(
    employee: Dict[str, Any],
    month: int,
    year: int,
) -> bool:
    """
    Current employees always visible.
    Left employees visible through left_effective month/year; hidden from the next month onward.
    """
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
    clean = str(status or "").strip().lower()
    if clean not in {EMPLOYMENT_CURRENT, EMPLOYMENT_LEFT}:
        raise ValueError("employment_status must be 'current' or 'left'")
    if clean == EMPLOYMENT_LEFT:
        d = today or date.today()
        return {
            "employment_status": EMPLOYMENT_LEFT,
            "left_effective_month": d.month,
            "left_effective_year": d.year,
        }
    return {
        "employment_status": EMPLOYMENT_CURRENT,
        "left_effective_month": None,
        "left_effective_year": None,
    }

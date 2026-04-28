"""
Domain model for a single attendance row (in-memory / API layer).
"""

from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Optional


@dataclass
class AttendanceRecord:
    """One row of attendance after parsing and enrichment."""

    employee_code: str
    date: date
    check_in: datetime
    check_out: datetime
    status: str
    working_hours: float
    late_minutes: int
    overtime_hours: float
    final_status: str

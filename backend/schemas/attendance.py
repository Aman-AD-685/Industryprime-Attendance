"""
Pydantic schemas for attendance API request/response bodies.
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AttendanceRowOut(BaseModel):
    """One enriched attendance row returned from upload or report."""

    employee_code: str
    date: date
    check_in: datetime
    check_out: datetime
    status: str
    working_hours: float = Field(..., description="Hours between check-in and check-out")
    late_minutes: int = Field(..., description="Minutes after 9:31 AM check-in threshold")
    overtime_hours: float = Field(..., description="Hours beyond 9h regular day")
    final_status: str = Field(
        ...,
        description="Derived status: half_day, late, overtime, late_overtime, present",
    )

    model_config = {"from_attributes": True}


class AttendanceUploadResponse(BaseModel):
    """Response for POST /attendance/upload."""

    message: str
    row_count: int
    rows: List[AttendanceRowOut]
    persisted_count: int = Field(0, description="Rows saved to public.attendance (Phase 2)")
    persist_messages: List[str] = Field(
        default_factory=list,
        description="Skipped codes or persistence notes",
    )


class AttendanceReportItem(AttendanceRowOut):
    """Same shape as upload row; used for GET /attendance/report mock data."""

    pass


class AttendanceRawIn(BaseModel):
    """Device / integration raw log (stored for later processing)."""

    device_user_id: Optional[str] = Field(default=None, max_length=200)
    timestamp: Optional[datetime] = None
    device_id: Optional[str] = Field(default=None, max_length=200)
    raw_json: Optional[Dict[str, Any]] = None


class AttendanceUpdateIn(BaseModel):
    employee_id: str
    date: date
    in_time: Optional[str] = None
    out_time: Optional[str] = None
    total_hours: Optional[float] = None
    working_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    shortfall: Optional[float] = None
    status: Optional[str] = None
    late_time: Optional[float] = None
    time_value: Optional[float] = None
    status_ot_sf: Optional[str] = None
    remarks: Optional[str] = Field(default=None, max_length=2000)


class EmployeeAttendanceRowOut(BaseModel):
    id: Optional[str] = None
    employee_id: str
    day: str
    date: date
    in_time: Optional[str] = None
    in_location: Optional[str] = None
    out_time: Optional[str] = None
    out_location: Optional[str] = None
    total_hours: float
    working_hours: float
    working_hours_display: str = "0.00"
    actual_hours: float
    shortfall: float
    shortfall_display: str = "0.00"
    present: str
    absent: str
    late_time: float
    late_time_display: str = "0.00"
    time_value: float
    status: str
    status_ot_sf: str
    remarks: Optional[str] = None


class RecalculateLateCutoffIn(BaseModel):
    dry_run: bool = False
    employee_id: Optional[str] = Field(
        default=None,
        description="Optional employees.id UUID; omit to migrate all persisted attendance rows",
    )


class RecalculateLateCutoffOut(BaseModel):
    rows_scanned: int
    rows_ready_to_upsert: int
    rows_changed_by_rules: int
    rows_upserted: int
    monthly_snapshots_refreshed: int


class AttendanceMonthOut(BaseModel):
    employee_id: str
    month: int
    year: int
    rows: List[EmployeeAttendanceRowOut]
    holidays: Dict[str, str] = Field(
        default_factory=dict,
        description="YYYY-MM-DD → holiday name for this month (auto-present when no punches)",
    )

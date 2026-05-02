from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class AttendanceEntryEmployeeOut(BaseModel):
    id: str
    name: Optional[str] = None
    employee_code: str


class AttendanceAddIn(BaseModel):
    user_id: str = Field(..., description="employees.id")
    date: date
    in_time: Optional[str] = Field(default=None, description="HH:MM or HH:MM:SS")
    out_time: Optional[str] = Field(default=None, description="HH:MM or HH:MM:SS")
    key: Optional[str] = Field(default=None, description="Must match ATTENDANCE_ENTRY_SECRET when set")


class AttendanceAddOut(BaseModel):
    id: str
    user_id: str
    date: date
    in_time: Optional[str] = None
    out_time: Optional[str] = None
    month: int
    year: int


class AttendanceEntryMonthRowOut(BaseModel):
    date: date
    in_time: Optional[str] = None
    out_time: Optional[str] = None
    created_at: Optional[str] = None

    model_config = {"extra": "ignore"}

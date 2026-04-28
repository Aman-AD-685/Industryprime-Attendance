from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class EmployeeCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    at_div_code: str = Field(..., min_length=1, max_length=64)
    department: Optional[str] = Field(default=None, max_length=200)
    designation: Optional[str] = Field(default=None, max_length=200)
    email: Optional[str] = Field(default=None, max_length=200)
    salary_monthly: Optional[float] = Field(default=None, ge=0)


class EmployeeUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    at_div_code: str = Field(..., min_length=1, max_length=64)
    department: Optional[str] = Field(default=None, max_length=200)
    designation: Optional[str] = Field(default=None, max_length=200)
    email: Optional[str] = Field(default=None, max_length=200)
    salary_monthly: Optional[float] = Field(default=None, ge=0)


class EmployeeOut(BaseModel):
    id: str
    employee_code: str
    at_div_code: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    salary_monthly: Optional[float] = None

    model_config = {"extra": "ignore"}

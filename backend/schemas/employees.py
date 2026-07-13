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
    professional_tax: Optional[float] = Field(default=None, ge=0)
    pf_employee_monthly: Optional[float] = Field(default=None, ge=0)
    income_tax_tds_monthly: Optional[float] = Field(default=None, ge=0)
    hra_monthly: Optional[float] = Field(default=None, ge=0)
    conveyance_monthly: Optional[float] = Field(default=None, ge=0)
    special_allowance_monthly: Optional[float] = Field(
        default=None,
        ge=0,
        description="Mobile allowance per month (₹); paid in full on payslip when set (not prorated by attendance). Enter monthly salary excluding this amount when set.",
    )
    salary_effective_month: Optional[int] = Field(default=None, ge=1, le=12)
    salary_effective_year: Optional[int] = Field(default=None, ge=2000, le=2100)


class EmployeeUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    at_div_code: str = Field(..., min_length=1, max_length=64)
    department: Optional[str] = Field(default=None, max_length=200)
    designation: Optional[str] = Field(default=None, max_length=200)
    email: Optional[str] = Field(default=None, max_length=200)
    salary_monthly: Optional[float] = Field(default=None, ge=0)
    professional_tax: Optional[float] = Field(default=None, ge=0)
    pf_employee_monthly: Optional[float] = Field(default=None, ge=0)
    income_tax_tds_monthly: Optional[float] = Field(default=None, ge=0)
    hra_monthly: Optional[float] = Field(default=None, ge=0)
    conveyance_monthly: Optional[float] = Field(default=None, ge=0)
    special_allowance_monthly: Optional[float] = Field(
        default=None,
        ge=0,
        description="Mobile allowance per month (₹); paid in full on payslip when set (not prorated by attendance). Enter monthly salary excluding this amount when set.",
    )
    salary_effective_month: Optional[int] = Field(default=None, ge=1, le=12)
    salary_effective_year: Optional[int] = Field(default=None, ge=2000, le=2100)


class EmployeeAllowancesSelfUpdate(BaseModel):
    hra_monthly: Optional[float] = Field(default=None, ge=0)
    conveyance_monthly: Optional[float] = Field(default=None, ge=0)
    special_allowance_monthly: Optional[float] = Field(
        default=None,
        ge=0,
        description="Mobile allowance per month (₹); paid in full on payslip when set (not prorated by attendance). Enter monthly salary excluding this amount when set.",
    )


class EmployeeOut(BaseModel):
    id: str
    employee_code: str
    at_div_code: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None
    salary_monthly: Optional[float] = None
    professional_tax: Optional[float] = None
    pf_employee_monthly: Optional[float] = None
    income_tax_tds_monthly: Optional[float] = None
    hra_monthly: Optional[float] = None
    conveyance_monthly: Optional[float] = None
    special_allowance_monthly: Optional[float] = Field(
        default=None,
        description="Mobile allowance per month (₹); paid in full on payslip when set.",
    )
    salary_effective_month: Optional[int] = None
    salary_effective_year: Optional[int] = None
    previous_salary_monthly: Optional[float] = None
    previous_salary_effective_until_month: Optional[int] = None
    previous_salary_effective_until_year: Optional[int] = None
    employment_status: Optional[str] = "current"
    left_effective_month: Optional[int] = None
    left_effective_year: Optional[int] = None

    model_config = {"extra": "ignore"}


class EmployeeEmploymentStatusUpdate(BaseModel):
    employment_status: str = Field(..., pattern="^(current|left)$")

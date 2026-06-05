from __future__ import annotations

from typing import Any, Dict, Optional


def _f(v: Any) -> Optional[float]:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def compute_payslip(
    employee: Dict[str, Any],
    *,
    month: int,
    year: int,
    calendar_days: int,
    present_days: int,
    absent_attendance_days: int,
    weekoff_days: int,
    holiday_days: int,
    salary_eligible_days: float,
    monthly_salary: float,
    leave_covered_days: float = 0.0,
    lop_days: float = 0.0,
) -> Dict[str, Any]:
    """
    Build payslip numbers for one calendar month.

    Earnings show **full monthly** Salary / HRA / Conveyance / Mobile (not attendance-prorated).
    Loss-of-pay (LOP) days reduce pay via an explicit **LOP deduction** line, not by shrinking
    the Salary earnings row.

    Example (no LOP): salary 21,000 + mobile 299 − professional tax 130 = net 21,169.

    `calendar_days` is the per-day rate denominator (IndustryPrime policy: 30).
    PF and TDS scale by paid days: (calendar_days − lop_days) / calendar_days.
    Professional tax is always the full monthly amount when set.
    """
    cal_days = max(int(calendar_days or 0), 1)
    lop_days_f = max(0.0, float(lop_days or 0))
    paid_factor = max(0.0, (float(cal_days) - lop_days_f) / float(cal_days))

    monthly_full = max(float(monthly_salary or 0), 0.0)
    hra_m = _f(employee.get("hra_monthly"))
    conv_m = _f(employee.get("conveyance_monthly"))
    spec_m = _f(employee.get("special_allowance_monthly"))
    hra = hra_m if hra_m is not None else 0.0
    conv = conv_m if conv_m is not None else 0.0
    spec = spec_m if spec_m is not None else 0.0

    base_monthly = max(0.0, round(monthly_full - hra - conv, 2))
    daily_rate = monthly_full / float(cal_days)

    def paid_prorate(amt: float) -> float:
        return round(float(amt) * paid_factor, 2)

    # Full monthly earnings (IndustryPrime payslip display).
    salary_earned = round(base_monthly, 2)
    hra_e = round(hra, 2) if hra_m is not None else None
    conv_e = round(conv, 2) if conv_m is not None else None
    mobile_full = round(float(spec), 2) if spec_m is not None else 0.0
    spec_e = mobile_full if spec_m is not None else None
    gross_earned = round(base_monthly + hra + conv + mobile_full, 2)

    pf_raw = _f(employee.get("pf_employee_monthly"))
    pt_raw = _f(employee.get("professional_tax"))
    tds_raw = _f(employee.get("income_tax_tds_monthly"))

    pf_amt = paid_prorate(pf_raw) if pf_raw is not None else None
    pt_amt = round(float(pt_raw), 2) if pt_raw is not None else None
    tds_amt = paid_prorate(tds_raw) if tds_raw is not None else None
    late_amt: Optional[float] = None
    lop_amt = round(daily_rate * lop_days_f, 2) if lop_days_f > 0 else None

    total_ded = round(
        (pf_amt or 0) + (pt_amt or 0) + (tds_amt or 0) + (lop_amt or 0) + (late_amt or 0),
        2,
    )
    net_pay = round(gross_earned - total_ded, 2)

    working_days = int(present_days + absent_attendance_days)
    paid_salary_days = round(max(0.0, float(cal_days) - lop_days_f), 2)

    return {
        "month": month,
        "year": year,
        "working_days": working_days,
        "present_days": int(present_days),
        "absent_days": int(absent_attendance_days),
        "leave_covered_days": round(float(leave_covered_days or 0), 2),
        "lop_days": round(lop_days_f, 2),
        "late_days": 0,
        "weekoff_days": int(weekoff_days),
        "holiday_days": int(holiday_days),
        "salary_eligible_days": round(float(salary_eligible_days or 0), 2),
        "paid_salary_days": paid_salary_days,
        "proration_factor": round(paid_factor, 6),
        "monthly_salary": monthly_full,
        "earnings": {
            "salary": salary_earned,
            "hra": hra_e if hra_m is not None else None,
            "conveyance": conv_e if conv_m is not None else None,
            "special_allowance": spec_e,
            "gross_earned": gross_earned,
        },
        "deductions": {
            "pf_employee": pf_amt,
            "professional_tax": pt_amt,
            "income_tax_tds": tds_amt,
            "lop_deduction": lop_amt,
            "late_deduction": late_amt,
            "total": total_ded,
        },
        "net_pay": net_pay,
        "display": {
            "salary_blank": False,
            "hra_blank": hra_m is None,
            "conveyance_blank": conv_m is None,
            "special_allowance_blank": spec_m is None,
            "pf_blank": pf_raw is None,
            "professional_tax_blank": pt_raw is None,
            "tds_blank": tds_raw is None,
            "lop_blank": lop_amt is None,
            "late_blank": True,
        },
    }

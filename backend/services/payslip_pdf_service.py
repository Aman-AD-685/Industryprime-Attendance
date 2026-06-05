from __future__ import annotations

import calendar
from datetime import date
from typing import Any, Dict, Optional

from fpdf import FPDF

from services.payslip_service import compute_payslip


def _payslip_ref(year: int, month: int, employee_code: str) -> str:
    code = (employee_code or "").strip() or "EMP"
    return f"PS-{year}{month:02d}-{code}"


def _rupees(v: float | None, blank: bool) -> str:
    if blank or v is None:
        return "-"
    return f"Rs.{v:,.2f}"


def _rupees_minus(v: float | None, blank: bool) -> str:
    if blank or v is None:
        return "-"
    return f"- Rs.{abs(float(v)):,.2f}"


def _format_days(v: float | None) -> str:
    if v is None:
        return "0 days"
    n = float(v)
    if n == int(n):
        return f"{int(n)} days"
    return f"{n:g} days"


def _format_balance_leave(total_leave: float | None, balance_leave: float | None) -> str:
    if total_leave is None or total_leave <= 0 or balance_leave is None:
        return "- days"
    n = float(balance_leave)
    if n == int(n):
        return f"{int(n)} days"
    return f"{n:g} days"


def build_payslip_pdf_bytes(
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
    total_leave: Optional[float] = None,
    balance_leave: Optional[float] = None,
    period_end: Optional[date] = None,
) -> bytes:
    ps = compute_payslip(
        employee,
        month=month,
        year=year,
        calendar_days=calendar_days,
        present_days=present_days,
        absent_attendance_days=absent_attendance_days,
        weekoff_days=weekoff_days,
        holiday_days=holiday_days,
        salary_eligible_days=salary_eligible_days,
        monthly_salary=monthly_salary,
        leave_covered_days=leave_covered_days,
        lop_days=lop_days,
        period_end=period_end,
    )
    disp = ps["display"]
    earn = ps["earnings"]
    ded = ps["deductions"]
    late_days = int(ps.get("late_days") or 0)

    name = str(employee.get("name") or employee.get("employee_code") or "Employee")
    code = str(employee.get("employee_code") or "")
    dept = str(employee.get("department") or "-")
    desig = str(employee.get("designation") or "-")
    ref = _payslip_ref(year, month, code)
    month_title = calendar.month_name[month] + f" {year}"

    pdf = FPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    pdf.set_margins(12, 12, 12)
    pdf.set_draw_color(220, 220, 220)
    pdf.set_fill_color(255, 255, 255)

    y = pdf.get_y()
    # Header row
    pdf.set_font("Helvetica", "B", 18)
    pdf.cell(100, 9, "IndustryPrime", ln=False)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 9, "PAYSLIP", align="R", ln=True)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(100, 5, "ATTENDANCE & HRIS PLATFORM", ln=False)
    pdf.set_font("Helvetica", "", 9)
    pdf.cell(0, 5, month_title, align="R", ln=True)
    pdf.set_font("Courier", "", 8)
    pdf.cell(0, 4, ref, align="R", ln=True)
    pdf.set_text_color(0, 0, 0)
    pdf.ln(2)

    # Employee band (gray)
    pdf.set_fill_color(244, 244, 245)
    band_h = 36
    pdf.rect(12, pdf.get_y(), 186, band_h, "F")
    y0 = pdf.get_y()
    pdf.set_xy(14, y0 + 3)
    pdf.set_font("Helvetica", "B", 7)
    pdf.cell(45, 4, "EMPLOYEE", ln=False)
    pdf.cell(45, 4, "EMPLOYEE ID", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_x(14)
    pdf.cell(45, 5, name[:42], ln=False)
    pdf.cell(45, 5, code or "-", ln=True)

    pdf.set_xy(14, y0 + 14)
    pdf.set_font("Helvetica", "B", 7)
    pdf.cell(45, 4, "DESIGNATION", ln=False)
    pdf.cell(45, 4, "DEPARTMENT", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_x(14)
    pdf.cell(45, 5, desig[:42], ln=False)
    pdf.cell(45, 5, dept[:42], ln=True)

    pdf.set_xy(14, y0 + 25)
    pdf.set_font("Helvetica", "B", 7)
    pdf.cell(45, 4, "MONTHLY SALARY", ln=False)
    pdf.cell(45, 4, "PAYMENT MODE", ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_x(14)
    pdf.cell(45, 5, _rupees(ps["monthly_salary"], False) + " / month", ln=False)
    pdf.cell(45, 5, "Bank transfer", ln=True)

    pdf.set_y(y0 + band_h + 2)

    # Attendance 4 columns
    pdf.set_font("Helvetica", "B", 7)
    col_w = 186 / 4
    x0 = 12
    y_att = pdf.get_y()
    pdf.rect(x0, y_att, 186, 16, "D")
    vals = [ps["working_days"], ps["present_days"], ps["absent_days"], late_days]
    labels = ["WORKING", "PRESENT", "ABSENT", "LATE"]
    for i, (lab, val) in enumerate(zip(labels, vals)):
        x = x0 + i * col_w
        if i:
            pdf.line(x, y_att, x, y_att + 16)
        pdf.set_xy(x, y_att + 2)
        pdf.set_font("Helvetica", "B", 12)
        if lab == "ABSENT":
            pdf.set_text_color(220, 38, 38)
        else:
            pdf.set_text_color(0, 0, 0)
        pdf.cell(col_w, 8, str(val), align="C", ln=False)
    pdf.set_text_color(0, 0, 0)
    for i, lab in enumerate(labels):
        x = x0 + i * col_w
        pdf.set_xy(x, y_att + 10)
        pdf.set_font("Helvetica", "B", 6)
        pdf.cell(col_w, 5, lab, align="C", ln=False)
    pdf.set_y(y_att + 18)

    # Leave balance row (3 columns)
    paid_leave = float(leave_covered_days or ps.get("leave_covered_days") or 0)
    lop_leave = float(lop_days or ps.get("lop_days") or 0)
    balance_label = _format_balance_leave(total_leave, balance_leave)
    y_leave = pdf.get_y()
    pdf.set_fill_color(249, 250, 251)
    pdf.rect(x0, y_leave, 186, 14, "FD")
    leave_vals = [balance_label, _format_days(paid_leave), _format_days(lop_leave)]
    leave_labels = ["BALANCE LEAVE", "ON LEAVE (PAID)", "LOP (SALARY CUT)"]
    col_w3 = 186 / 3
    for i, (lab, val) in enumerate(zip(leave_labels, leave_vals)):
        x = x0 + i * col_w3
        if i:
            pdf.line(x, y_leave, x, y_leave + 14)
        pdf.set_xy(x, y_leave + 2)
        pdf.set_font("Helvetica", "B", 6)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(col_w3, 4, lab, align="C", ln=False)
        pdf.set_xy(x, y_leave + 7)
        pdf.set_font("Helvetica", "B", 9)
        if lab == "ON LEAVE (PAID)":
            pdf.set_text_color(4, 120, 87)
        elif lab == "LOP (SALARY CUT)":
            pdf.set_text_color(220, 38, 38)
        else:
            pdf.set_text_color(0, 0, 0)
        pdf.cell(col_w3, 6, val, align="C", ln=False)
    pdf.set_text_color(0, 0, 0)
    pdf.set_y(y_leave + 16)

    # Two columns earnings / deductions
    pdf.set_font("Helvetica", "B", 8)
    pdf.cell(93, 6, "EARNINGS", ln=False)
    pdf.cell(93, 6, "DEDUCTIONS", ln=True)
    pdf.set_font("Helvetica", "", 8)
    row_h = 6
    rows_pdf = [
        ("Salary", earn["salary"], False, "PF (employee 12%)", ded["pf_employee"], disp["pf_blank"]),
        ("HRA", earn["hra"], disp["hra_blank"], "Professional tax", ded["professional_tax"], disp["professional_tax_blank"]),
        ("Conveyance allowance", earn["conveyance"], disp["conveyance_blank"], "Income tax (TDS)", ded["income_tax_tds"], disp["tds_blank"]),
        (
            "Mobile allowance",
            earn["special_allowance"],
            disp["special_allowance_blank"],
            "LOP deduction",
            ded.get("lop_deduction"),
            disp.get("lop_blank", True),
        ),
        (
            "",
            None,
            True,
            "Late deduction",
            ded["late_deduction"],
            disp["late_blank"],
        ),
    ]
    y_tbl = pdf.get_y()
    for el, ev, eb, dl, dv, db in rows_pdf:
        pdf.set_x(12)
        pdf.cell(55, row_h, el[:32], ln=False)
        pdf.cell(38, row_h, _rupees(ev, eb), align="R", ln=False)
        pdf.cell(55, row_h, dl[:32], ln=False)
        pdf.cell(38, row_h, _rupees_minus(dv, db), align="R", ln=True)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_x(12)
    pdf.cell(55, row_h, "Gross earned", ln=False)
    pdf.cell(38, row_h, _rupees(earn["gross_earned"], False), align="R", ln=False)
    pdf.cell(55, row_h, "Total deductions", ln=False)
    pdf.cell(38, row_h, _rupees_minus(ded["total"], False), align="R", ln=True)

    pdf.ln(4)
    # Net bar
    y_net = pdf.get_y()
    pdf.set_fill_color(244, 244, 245)
    pdf.rect(12, y_net, 186, 18, "F")
    pdf.set_xy(14, y_net + 3)
    pdf.set_font("Helvetica", "B", 7)
    pdf.cell(90, 5, "NET TAKE-HOME PAY", ln=False)
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 5, _rupees(ps["net_pay"], False), align="R", ln=True)
    pdf.set_xy(14, y_net + 10)
    pdf.set_font("Helvetica", "", 7)
    pdf.cell(0, 5, f"{month_title} - {name[:40]}", ln=True)
    pdf.set_y(y_net + 20)

    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, "System generated", align="C", ln=True)
    pdf.set_text_color(0, 0, 0)

    out = pdf.output()
    return bytes(out)

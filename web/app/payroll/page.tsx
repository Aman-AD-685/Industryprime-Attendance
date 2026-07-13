"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, apiFetchBlob, PAYROLL_API_TIMEOUT_MS } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/hooks/useSession";

type Employee = {
  id: string;
  employee_code?: string | null;
  name?: string | null;
  email?: string | null;
  department?: string | null;
  designation?: string | null;
  salary_monthly?: number | null;
  professional_tax?: number | null;
  pf_employee_monthly?: number | null;
  income_tax_tds_monthly?: number | null;
  hra_monthly?: number | null;
  conveyance_monthly?: number | null;
  special_allowance_monthly?: number | null;
  employment_status?: "current" | "left" | null;
  left_effective_month?: number | null;
  left_effective_year?: number | null;
};

type PayslipEarnings = {
  salary: number;
  hra: number | null;
  conveyance: number | null;
  special_allowance: number | null;
  gross_earned: number;
};

type PayslipDeductions = {
  pf_employee: number | null;
  professional_tax: number | null;
  income_tax_tds: number | null;
  lop_deduction?: number | null;
  late_deduction: number | null;
  total: number;
};

type PayslipDisplay = {
  hra_blank: boolean;
  conveyance_blank: boolean;
  special_allowance_blank: boolean;
  pf_blank: boolean;
  professional_tax_blank: boolean;
  tds_blank: boolean;
  lop_blank?: boolean;
  late_blank: boolean;
};

type Payslip = {
  month: number;
  year: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  late_days?: number;
  weekoff_days: number;
  holiday_days: number;
  salary_eligible_days: number;
  leave_covered_days?: number;
  lop_days?: number;
  monthly_salary: number;
  earnings: PayslipEarnings;
  deductions: PayslipDeductions;
  display: PayslipDisplay;
  net_pay: number;
};

type LeaveSummary = {
  total_leave: number;
  total_used_leave: number;
  balance_leave: number;
  month_used_leave?: number;
  leave_covered_days?: number;
  lop_days?: number;
};

type PayrollItem = {
  employee: Employee;
  month: number;
  year: number;
  /** Denominator for salary per-day (always 30). */
  total_days: number;
  /** Actual length of the selected calendar month (28–31). */
  calendar_days_in_month_actual?: number;
  /** Same as total_days; explicit for clarity. */
  salary_basis_days?: number;
  total_days_present: number;
  total_days_absent: number;
  attendance_absent_days: number;
  weekoff_days?: number;
  holiday_days?: number;
  salary_eligible_days?: number;
  leave_covered_days?: number;
  lop_days?: number;
  attendance_period_end?: string | null;
  total_hours_in_office: number;
  total_sundays: number;
  holidays: number;
  salary_per_day: number;
  total_salary: number;
  deductions: number;
  final_payable_amount: number;
  leave: LeaveSummary;
  payslip: Payslip;
};

function displayBalanceLeave(totalLeave: number | null | undefined, balanceLeave: number | null | undefined): string | number {
  if (totalLeave == null || totalLeave <= 0) return "—";
  if (balanceLeave == null) return "—";
  return balanceLeave;
}

function money(value: number | null | undefined, blank: boolean) {
  if (blank || value === null || value === undefined) return "—";
  return `₹${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function moneySignedDeduction(value: number | null | undefined, blank: boolean) {
  if (blank || value === null || value === undefined) return "—";
  const n = Number(value || 0);
  const abs = `₹${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n === 0 ? `- ${abs}` : `- ${abs}`;
}

function payslipReference(employeeCode: string | null | undefined, month: number, year: number) {
  const code = (employeeCode && String(employeeCode).trim()) || "EMP";
  return `PS-${year}${String(month).padStart(2, "0")}-${code}`;
}
function monthInputValue(month: number, year: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}
function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
}

type Tint = "present" | "absent" | "weekoff" | "holiday" | "salary" | "neutral";

function Metric({
  label,
  value,
  strong = false,
  tint = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
  tint?: Tint;
}) {
  const ring =
    tint === "present"
      ? "ring-1 ring-emerald-400/60 bg-emerald-50/70 dark:bg-emerald-950/30"
      : tint === "absent"
        ? "ring-1 ring-rose-400/60 bg-rose-50/70 dark:bg-rose-950/30"
        : tint === "weekoff"
          ? "ring-1 ring-amber-400/60 bg-amber-50/70 dark:bg-amber-950/30"
          : tint === "holiday"
            ? "ring-1 ring-sky-400/60 bg-sky-50/70 dark:bg-sky-950/30"
            : tint === "salary"
              ? "ring-1 ring-teal-400/60 bg-teal-50/70 dark:bg-teal-950/30"
              : "";
  const valueClass =
    strong && tint === "neutral"
      ? "font-bold text-emerald-700 dark:text-emerald-300"
      : strong
        ? "font-bold text-zinc-900 dark:text-zinc-50"
        : "font-semibold text-zinc-900 dark:text-zinc-100";
  return (
    <div className={`rounded-2xl px-2 py-1.5 ${ring}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-0.5 text-sm ${valueClass}`}>{value}</div>
    </div>
  );
}

function PayslipDocument({
  item,
  variantLabel,
  onDownloadPdf,
  pdfBusy,
}: {
  item: PayrollItem;
  variantLabel?: string;
  onDownloadPdf?: () => void;
  pdfBusy?: boolean;
}) {
  const e = item.employee;
  const ps = item.payslip;
  const d = ps.display;
  const late = ps.late_days ?? 0;
  const ref = payslipReference(e.employee_code, ps.month, ps.year);

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white text-zinc-900 shadow-md ring-1 ring-black/5 dark:border-zinc-300 dark:bg-white dark:text-zinc-900 dark:ring-zinc-400/30">
      {/* Header — brand left, payslip meta right */}
      <div className="flex flex-col justify-between gap-4 border-b border-zinc-200 bg-white px-5 py-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600" aria-hidden />
          <div>
            <div className="text-xl font-extrabold tracking-tight text-zinc-900">IndustryPrime</div>
            <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{"Attendance & HRIS platform"}</div>
            {variantLabel ? (
              <div className="mt-2 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
                {variantLabel}
              </div>
            ) : null}
          </div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-zinc-800">Payslip</div>
          <div className="mt-1 text-sm font-semibold text-zinc-700">{monthLabel(ps.month, ps.year)}</div>
          <div className="mt-1 font-mono text-xs text-zinc-500">{ref}</div>
        </div>
      </div>

      {/* Employee band */}
      <div className="border-b border-zinc-200 bg-zinc-100 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <dl className="space-y-2.5 text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Employee</dt>
              <dd className="font-semibold text-zinc-900">{e.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Designation</dt>
              <dd className="text-zinc-800">{e.designation || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Monthly salary</dt>
              <dd className="font-semibold text-zinc-900">{money(ps.monthly_salary, false)} / month</dd>
            </div>
          </dl>
          <dl className="space-y-2.5 text-sm">
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Employee ID</dt>
              <dd className="font-mono font-semibold text-zinc-900">{e.employee_code || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Department</dt>
              <dd className="text-zinc-800">{e.department || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Payment mode</dt>
              <dd className="text-zinc-800">Bank transfer</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Attendance — four columns */}
      <div className="grid grid-cols-4 divide-x divide-zinc-200 border-b border-zinc-200 bg-white">
        {(
          [
            { k: "Working", v: ps.working_days, red: false },
            { k: "Present", v: ps.present_days, red: false },
            { k: "Absent", v: ps.absent_days, red: true },
            { k: "LOP", v: ps.lop_days ?? item.leave?.lop_days ?? 0, red: true },
          ] as const
        ).map((c) => (
          <div key={c.k} className="px-2 py-3 text-center sm:px-3 sm:py-4">
            <div className={`text-xl font-bold tabular-nums sm:text-2xl ${c.red ? "text-red-600" : "text-zinc-900"}`}>{c.v}</div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-wide text-zinc-500 sm:text-[10px]">{c.k}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 border-b border-zinc-200 bg-zinc-50 px-5 py-3 text-sm">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Balance leave</div>
          <div className="font-semibold text-zinc-900">
            {displayBalanceLeave(item.leave?.total_leave, item.leave?.balance_leave)} days
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">On leave (paid)</div>
          <div className="font-semibold text-emerald-700">{ps.leave_covered_days ?? item.leave?.leave_covered_days ?? 0} days</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">LOP (salary cut)</div>
          <div className="font-semibold text-red-600">{ps.lop_days ?? item.leave?.lop_days ?? 0} days</div>
        </div>
      </div>

      {/* Earnings | Deductions */}
      <div className="grid border-b border-zinc-200 bg-white sm:grid-cols-2">
        <div className="border-b border-zinc-200 px-4 py-4 sm:border-b-0 sm:border-r sm:border-zinc-200">
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Earnings</div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-2 text-zinc-600">Salary</td>
                <td className="py-2 text-right font-medium text-zinc-900">{money(ps.earnings.salary, false)}</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 text-zinc-600">HRA</td>
                <td className="py-2 text-right font-medium text-zinc-900">{money(ps.earnings.hra, d.hra_blank)}</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 text-zinc-600">Conveyance allowance</td>
                <td className="py-2 text-right font-medium text-zinc-900">{money(ps.earnings.conveyance, d.conveyance_blank)}</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 text-zinc-600">Mobile allowance</td>
                <td className="py-2 text-right font-medium text-zinc-900">{money(ps.earnings.special_allowance, d.special_allowance_blank)}</td>
              </tr>
              <tr>
                <td className="pt-3 text-xs font-bold uppercase text-zinc-800">Gross earned</td>
                <td className="pt-3 text-right text-base font-bold text-zinc-900">{money(ps.earnings.gross_earned, false)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="px-4 py-4">
          <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Deductions</div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-2 text-zinc-600">PF (employee 12%)</td>
                <td className="py-2 text-right font-medium text-zinc-900">{moneySignedDeduction(ps.deductions.pf_employee, d.pf_blank)}</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 text-zinc-600">Professional tax</td>
                <td className="py-2 text-right font-medium text-zinc-900">{moneySignedDeduction(ps.deductions.professional_tax, d.professional_tax_blank)}</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 text-zinc-600">Income tax (TDS)</td>
                <td className="py-2 text-right font-medium text-zinc-900">{moneySignedDeduction(ps.deductions.income_tax_tds, d.tds_blank)}</td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 text-zinc-600">LOP deduction</td>
                <td className="py-2 text-right font-medium text-zinc-900">
                  {moneySignedDeduction(ps.deductions.lop_deduction, d.lop_blank ?? true)}
                </td>
              </tr>
              <tr className="border-b border-zinc-100">
                <td className="py-2 text-zinc-600">Late deduction</td>
                <td className="py-2 text-right font-medium text-zinc-900">{moneySignedDeduction(ps.deductions.late_deduction, d.late_blank)}</td>
              </tr>
              <tr>
                <td className="pt-3 text-xs font-bold uppercase text-zinc-800">Total deductions</td>
                <td className="pt-3 text-right text-base font-bold text-zinc-900">{moneySignedDeduction(ps.deductions.total, false)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Net pay bar */}
      <div className="flex flex-col gap-4 bg-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {onDownloadPdf ? (
            <button
              type="button"
              title="Download PDF"
              disabled={pdfBusy}
              onClick={onDownloadPdf}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-300 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          ) : null}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">Net take-home pay</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {monthLabel(ps.month, ps.year)} · {e.name || e.employee_code}
            </div>
          </div>
        </div>
        <div className="text-2xl font-bold tabular-nums text-zinc-900 sm:text-3xl">{money(ps.net_pay, false)}</div>
      </div>
      <p className="border-t border-zinc-200 bg-zinc-50 py-2 text-center text-[9px] font-semibold uppercase tracking-widest text-zinc-400">System generated</p>
    </div>
  );
}

export default function PayrollPage() {
  const { user } = useSession();
  const role = user?.role ?? getStoredUser()?.role ?? "user";
  const canViewPayslip = can.viewPayslip(role);

  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const selected = items.find((item) => item.employee.id === selectedId) || items[0] || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<{ items: PayrollItem[] }>(
        `/payroll/summary?month=${month}&year=${year}`,
        undefined,
        PAYROLL_API_TIMEOUT_MS,
      );
      setItems(data.items || []);
      setSelectedId((current) => current || data.items?.[0]?.employee.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payroll");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onAttendance = () => void load();
    window.addEventListener("industryprime-attendance-change", onAttendance);
    return () => window.removeEventListener("industryprime-attendance-change", onAttendance);
  }, [load]);

  function changeMonth(value: string) {
    const [nextYear, nextMonth] = value.split("-").map(Number);
    setYear(nextYear);
    setMonth(nextMonth);
    setSelectedId(null);
  }
  function shiftMonth(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
    setSelectedId(null);
  }

  async function downloadPayslipPdf(empId: string, m = month, y = year) {
    setPdfBusy(true);
    setError(null);
    try {
      const blob = await apiFetchBlob(
        `/payroll/payslip-pdf?month=${m}&year=${y}&employee_id=${encodeURIComponent(empId)}`,
        undefined,
        PAYROLL_API_TIMEOUT_MS,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `payslip-${empId}-${y}-${String(m).padStart(2, "0")}.pdf`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to download PDF");
    } finally {
      setPdfBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 max-w-2xl shrink">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Payroll</h2>
          <div
            className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm leading-relaxed text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-200"
            role="note"
            aria-label="How payroll period and salary basis work"
          >
            <p className="m-0">
              {canViewPayslip ? (
                <>
                  Payslip for the month selected above. Use Previous / Next or the month picker to change the period.
                </>
              ) : (
                <>Attendance and leave summary for the month selected above.</>
              )}{" "}
              Salary per-day and proration use a <strong className="font-semibold text-zinc-950 dark:text-zinc-50">30-day</strong>{" "}
              month for every calendar month (attendance still follows real dates).{" "}
              <span className="text-zinc-700 dark:text-zinc-300">
                Mobile allowance is the full monthly amount from the employee profile when set, not reduced by attendance.
              </span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Previous
          </button>
          <input
            type="month"
            value={monthInputValue(month, year)}
            onChange={(event) => changeMonth(event.target.value)}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Next
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.employee.id}
              type="button"
              onClick={() => setSelectedId(item.employee.id)}
              className={`rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                selected?.employee.id === item.employee.id
                  ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  : "border-zinc-200 bg-white/75 dark:border-zinc-800 dark:bg-zinc-950/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {item.employee.name || item.employee.employee_code}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {item.employee.email || item.employee.employee_code}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm dark:bg-zinc-900 dark:text-emerald-300">
                    {monthLabel(item.month, item.year)}
                  </span>
                  {(item.employee.employment_status || "current") === "left" ? (
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                      Left
                    </span>
                  ) : (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                      Current Emp
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Metric tint="present" label="Present" value={item.total_days_present} />
                <Metric tint="absent" label="Absent (month)" value={item.total_days_absent} />
                <Metric tint="weekoff" label="Weekoff" value={item.weekoff_days ?? item.total_sundays ?? 0} />
                <Metric tint="holiday" label="Holiday" value={item.holiday_days ?? item.holidays ?? 0} />
                <Metric tint="salary" label="Salary days" value={item.salary_eligible_days ?? item.total_days_present} />
                <Metric label="Balance leave" value={displayBalanceLeave(item.leave?.total_leave, item.leave?.balance_leave)} />
                <Metric tint="absent" label="LOP days" value={item.lop_days ?? item.leave?.lop_days ?? 0} />
                <Metric label="Hours" value={item.total_hours_in_office} />
              </div>
              {canViewPayslip ? (
                <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <Metric strong tint="neutral" label="Net pay (payslip)" value={money(item.payslip?.net_pay, false)} />
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {canViewPayslip && selected && selected.payslip && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Payslip — {selected.employee.name || selected.employee.employee_code} — {monthLabel(month, year)}
            </h3>
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => void downloadPayslipPdf(selected.employee.id)}
              className="rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pdfBusy ? "Preparing PDF…" : "Download this in PDF format"}
            </button>
          </div>
          {selected.attendance_period_end ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Attendance summarized through{" "}
              <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">{selected.attendance_period_end}</span> for{" "}
              {monthLabel(month, year)}.
            </p>
          ) : null}

          <PayslipDocument
            item={selected}
            onDownloadPdf={() => void downloadPayslipPdf(selected.employee.id)}
            pdfBusy={pdfBusy}
          />
        </div>
      )}
    </div>
  );
}

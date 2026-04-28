"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Employee = { id: string; employee_code?: string | null; name?: string | null; email?: string | null; department?: string | null; designation?: string | null; salary_monthly?: number | null; };
type LeaveRequest = { id?: string; leave_date_start?: string; leave_date_end?: string; leave_type?: string; status?: string; reason?: string; };
type AttendanceRecord = { id?: string; date?: string; check_in?: string | null; check_out?: string | null; working_hours?: number | string | null; status?: string | null; };
type PayrollItem = { employee: Employee; month: number; year: number; total_days: number; total_days_present: number; total_days_absent: number; total_hours_in_office: number; total_sundays: number; holidays: number; salary_per_day: number; total_salary: number; deductions: number; final_payable_amount: number; leave: { total_leave: number; total_used_leave: number; balance_leave: number; requests: LeaveRequest[]; }; attendance: AttendanceRecord[]; };

function money(value: number) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
function monthInputValue(month: number, year: number) { return `${year}-${String(month).padStart(2, "0")}`; }
function monthLabel(month: number, year: number) { return new Date(year, month - 1, 1).toLocaleString("en", { month: "long", year: "numeric" }); }

export default function PayrollPage() {
  const now = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selected = items.find((item) => item.employee.id === selectedId) || items[0] || null;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiFetch<{ items: PayrollItem[] }>(`/payroll/summary?month=${month}&year=${year}`);
      setItems(data.items || []);
      setSelectedId((current) => current || data.items?.[0]?.employee.id || null);
    } catch (err) { setError(err instanceof Error ? err.message : "Failed to load payroll"); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { void load(); }, [load]);
  function changeMonth(value: string) { const [nextYear, nextMonth] = value.split("-").map(Number); setYear(nextYear); setMonth(nextMonth); setSelectedId(null); }
  function shiftMonth(delta: number) { const next = new Date(year, month - 1 + delta, 1); setYear(next.getFullYear()); setMonth(next.getMonth() + 1); setSelectedId(null); }

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Payroll</h2><p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Dynamic employee payroll from Attendance, Leave, and Employee data.</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => shiftMonth(-1)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">Previous</button><input type="month" value={monthInputValue(month, year)} onChange={(event) => changeMonth(event.target.value)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100" /><button type="button" onClick={() => shiftMonth(1)} className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">Next</button></div></div>
    {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{error}</div>}
    {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-900" />)}</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <button key={item.employee.id} type="button" onClick={() => setSelectedId(item.employee.id)} className={`rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${selected?.employee.id === item.employee.id ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/10" : "border-zinc-200 bg-white/75 dark:border-zinc-800 dark:bg-zinc-950/40"}`}><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{item.employee.name || item.employee.employee_code}</div><div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.employee.email || item.employee.employee_code}</div></div><span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-sm dark:bg-zinc-900 dark:text-emerald-300">{monthLabel(item.month, item.year)}</span></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><Metric label="Present" value={item.total_days_present} /><Metric label="Absent" value={item.total_days_absent} /><Metric label="Hours" value={item.total_hours_in_office} /><Metric label="Payable" value={money(item.final_payable_amount)} strong /></div></button>)}</div>}
    {selected && <div className="rounded-3xl border border-zinc-200 bg-white/75 p-5 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40"><div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between"><div><h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{selected.employee.name || selected.employee.employee_code}</h3><p className="text-sm text-zinc-500 dark:text-zinc-400">{selected.employee.designation || "Employee"} • {selected.employee.department || "Department"}</p></div><div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Final Payable: {money(selected.final_payable_amount)}</div></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Detail label="Total Days" value={selected.total_days} /><Detail label="Total Days Present" value={selected.total_days_present} /><Detail label="Total Days Absent" value={selected.total_days_absent} /><Detail label="Total Hours in Office" value={selected.total_hours_in_office} /><Detail label="Total Sundays" value={selected.total_sundays} /><Detail label="Holidays" value={selected.holidays} /><Detail label="Salary per Day" value={money(selected.salary_per_day)} /><Detail label="Total Salary" value={money(selected.total_salary)} /><Detail label="Deductions" value={money(selected.deductions)} /><Detail label="Final Payable Amount" value={money(selected.final_payable_amount)} highlight /><Detail label="Total Leave" value={selected.leave.total_leave} /><Detail label="Balance Leave" value={selected.leave.balance_leave} /></div><div className="mt-6 grid gap-4 lg:grid-cols-2"><DataList title="Attendance" empty="No attendance rows for this month." rows={selected.attendance.slice(0, 12).map((row) => ({ key: row.id || String(row.date), title: String(row.date || "-"), meta: `${row.check_in || "-"} → ${row.check_out || "-"} • ${Number(row.working_hours || 0).toFixed(2)} hrs` }))} /><DataList title="Leave" empty="No leave requests for this period." rows={selected.leave.requests.slice(0, 12).map((row) => ({ key: row.id || `${row.leave_date_start}-${row.leave_date_end}`, title: `${row.leave_date_start || "-"}${row.leave_date_end ? ` → ${row.leave_date_end}` : ""}`, meta: `${row.leave_type || "Leave"} • ${row.status || "pending"}` }))} /></div></div>}
  </div>;
}

function Metric({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) { return <div><div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div><div className={`mt-1 text-sm ${strong ? "font-bold text-emerald-700 dark:text-emerald-300" : "font-semibold text-zinc-900 dark:text-zinc-100"}`}>{value}</div></div>; }
function Detail({ label, value, highlight = false }: { label: string; value: React.ReactNode; highlight?: boolean }) { return <div className={`rounded-2xl border p-4 ${highlight ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100" : "border-zinc-200 bg-white/70 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100"}`}><div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div><div className="mt-2 text-lg font-bold">{value}</div></div>; }
function DataList({ title, rows, empty }: { title: string; rows: { key: string; title: string; meta: string }[]; empty: string }) { return <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40"><h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h4><div className="mt-3 space-y-2">{rows.length === 0 ? <div className="text-sm text-zinc-500 dark:text-zinc-400">{empty}</div> : rows.map((row) => <div key={row.key} className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-950/50"><div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{row.title}</div><div className="text-xs text-zinc-500 dark:text-zinc-400">{row.meta}</div></div>)}</div></div>; }

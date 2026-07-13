"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type Employee = {
  id: string;
  employee_code: string;
  name?: string | null;
  department?: string | null;
  designation?: string | null;
  employment_status?: "current" | "left" | null;
};

type MonthYear = { month: number; year: number };

function currentMonthYear(): MonthYear {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

function monthYearLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString("en", { month: "long", year: "numeric" });
}

function buildMonthYearOptions(): MonthYear[] {
  const now = new Date();
  const options: MonthYear[] = [];
  for (let offset = -18; offset <= 3; offset += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    options.push({ month: d.getMonth() + 1, year: d.getFullYear() });
  }
  return options.reverse();
}

export default function AttendanceEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<MonthYear>(currentMonthYear);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const monthOptions = useMemo(() => buildMonthYearOptions(), []);

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      setLoading(true);
      setError(null);
      try {
        const rows = await apiFetch<Employee[]>(
          `/employees?status=active&for_month=${period.month}&for_year=${period.year}`
        );
        if (!cancelled) setEmployees(rows);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load employees");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadEmployees();
    return () => {
      cancelled = true;
    };
  }, [period.month, period.year]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.employee_code, employee.department, employee.designation]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [employees, query]);

  const periodKey = `${period.year}-${period.month}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Attendance Management
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Select an employee to open their month-wise attendance sheet.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 md:max-w-xl md:flex-row md:items-end">
          <div className="md:w-48">
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Month & Year</label>
            <select
              value={periodKey}
              onChange={(event) => {
                const [year, month] = event.target.value.split("-").map(Number);
                setPeriod({ month, year });
              }}
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/60 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
            >
              {monthOptions.map((opt) => (
                <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                  {monthYearLabel(opt.month, opt.year)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Search employee</label>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, code, department..."
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
            />
          </div>
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
            <div
              key={index}
              className="h-32 animate-pulse rounded-3xl border border-zinc-200/70 bg-white/70 shadow-sm dark:border-zinc-800/70 dark:bg-zinc-950/40"
            />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((employee) => (
            <Link
              key={employee.id}
              href={`/attendance/${employee.id}?month=${period.month}&year=${period.year}`}
              className="group rounded-3xl border border-zinc-200/70 bg-white/75 p-5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md dark:border-zinc-800/70 dark:bg-zinc-950/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                    {employee.name || "Unnamed employee"}
                  </div>
                  <div className="mt-1 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {employee.employee_code}
                  </div>
                </div>
                {(employee.employment_status || "current") === "left" ? (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                    Left
                  </span>
                ) : (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                    Current Emp
                  </span>
                )}
              </div>
              <div className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                {[employee.department, employee.designation].filter(Boolean).join(" · ") || "No department set"}
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-3xl border border-zinc-200/70 bg-white/75 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-400 md:col-span-2 xl:col-span-3">
              No employees for {monthYearLabel(period.month, period.year)}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

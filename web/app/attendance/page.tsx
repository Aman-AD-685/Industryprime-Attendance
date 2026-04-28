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
};

export default function AttendanceEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadEmployees() {
      setLoading(true);
      setError(null);
      try {
        const rows = await apiFetch<Employee[]>("/employees?status=active");
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
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((employee) =>
      [
        employee.name,
        employee.employee_code,
        employee.department,
        employee.designation,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [employees, query]);

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
        <div className="w-full md:max-w-md">
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Search employee
          </label>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, code, department..."
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
          />
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
              href={`/attendance/${employee.id}`}
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
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                  Active
                </span>
              </div>
              <div className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
                {[employee.department, employee.designation].filter(Boolean).join(" · ") || "No department set"}
              </div>
            </Link>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-3xl border border-zinc-200/70 bg-white/75 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800/70 dark:bg-zinc-950/40 dark:text-zinc-400 md:col-span-2 xl:col-span-3">
              No employees found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

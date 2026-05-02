"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { publicApiFetch } from "@/lib/api";
import AttendanceEntryForm from "@/components/attendance/AttendanceEntryForm";
import AttendanceEntryMonthTable, {
  type MonthRow,
} from "@/components/attendance/AttendanceEntryMonthTable";
import { withEntryKey } from "@/components/attendance/publicEntryApi";

type EmployeeOption = { id: string; name?: string | null; employee_code: string };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthYearFromDate(iso: string): { month: number; year: number } {
  const [y, m] = iso.split("-").map(Number);
  return { month: m || 1, year: y || new Date().getFullYear() };
}

function toHHMM(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const s = String(v).trim();
  return s.length >= 5 && s[2] === ":" ? s.slice(0, 5) : s;
}

const STORAGE_USER_ID = "hris.attendanceEntry.userId";
const STORAGE_DATE = "hris.attendanceEntry.date";

function Inner() {
  const searchParams = useSearchParams();
  const key = searchParams.get("key");

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [date, setDate] = useState(todayISO);
  const [userId, setUserId] = useState("");
  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);
  const [monthLoading, setMonthLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editFormKey, setEditFormKey] = useState<string | null>(null);
  const [prefillIn, setPrefillIn] = useState("");
  const [prefillOut, setPrefillOut] = useState("");

  const { month, year } = useMemo(() => monthYearFromDate(date), [date]);

  const loadEmployees = useCallback(async () => {
    setEmployeesLoading(true);
    setError(null);
    try {
      const path = withEntryKey("/attendance/entry/employees", key);
      const rows = await publicApiFetch<EmployeeOption[]>(path);
      setEmployees(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setEmployees([]);
      setError(e instanceof Error ? e.message : "Could not load employees");
    } finally {
      setEmployeesLoading(false);
    }
  }, [key]);

  const loadMonth = useCallback(
    async (uid: string, overrideMonth?: number, overrideYear?: number) => {
      if (!uid) {
        setMonthRows([]);
        return;
      }
      const m = overrideMonth ?? month;
      const y = overrideYear ?? year;
      setMonthLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({
          user_id: uid,
          month: String(m),
          year: String(y),
        });
        if (key) qs.set("key", key);
        const rows = await publicApiFetch<MonthRow[]>(`/attendance/entry/month?${qs.toString()}`);
        setMonthRows(Array.isArray(rows) ? rows : []);
      } catch (e) {
        setMonthRows([]);
        setError(e instanceof Error ? e.message : "Could not load monthly data");
      } finally {
        setMonthLoading(false);
      }
    },
    [key, month, year],
  );

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (employeesLoading || employees.length === 0) return;
    try {
      const savedId = sessionStorage.getItem(STORAGE_USER_ID);
      if (savedId && employees.some((e) => e.id === savedId)) {
        setUserId(savedId);
      }
      const savedDate = sessionStorage.getItem(STORAGE_DATE);
      if (savedDate && /^\d{4}-\d{2}-\d{2}$/.test(savedDate)) {
        setDate(savedDate);
      }
    } catch {
      /* private mode / storage blocked */
    }
  }, [employees, employeesLoading]);

  useEffect(() => {
    try {
      if (userId) sessionStorage.setItem(STORAGE_USER_ID, userId);
      else sessionStorage.removeItem(STORAGE_USER_ID);
    } catch {
      /* ignore */
    }
  }, [userId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_DATE, date);
    } catch {
      /* ignore */
    }
  }, [date]);

  useEffect(() => {
    void loadMonth(userId);
  }, [loadMonth, userId]);

  function handleEditRow(row: MonthRow) {
    if (!userId) {
      setError("Select a user first, then click Edit on a row.");
      return;
    }
    const d =
      typeof row.date === "string"
        ? row.date.slice(0, 10)
        : row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date).slice(0, 10);
    setDate(d);
    setPrefillIn(toHHMM(row.in_time));
    setPrefillOut(toHHMM(row.out_time));
    setEditFormKey(`${userId}-${d}-${row.in_time ?? ""}-${row.out_time ?? ""}-${Date.now()}`);
    setError(null);
    setSuccess("Add or change OUT time (or IN), then save — this updates the existing entry.");
  }

  async function handleSubmit(payload: {
    user_id: string;
    date: string;
    in_time: string | null;
    out_time: string | null;
  }) {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await publicApiFetch("/attendance/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          key: key || undefined,
        }),
      });
      const dateStr =
        typeof payload.date === "string"
          ? payload.date.slice(0, 10)
          : String(payload.date).slice(0, 10);
      setSuccess("Attendance saved.");
      try {
        sessionStorage.setItem(STORAGE_USER_ID, payload.user_id);
        sessionStorage.setItem(STORAGE_DATE, dateStr);
      } catch {
        /* ignore */
      }
      setUserId(payload.user_id);
      setDate(dateStr);
      const { month: savedM, year: savedY } = monthYearFromDate(dateStr);
      await loadMonth(payload.user_id, savedM, savedY);
      setEditFormKey(null);
    } catch (e) {
      setSuccess(null);
      setError(e instanceof Error ? e.message : "Save failed");
      throw e;
    } finally {
      setSubmitting(false);
    }
  }

  const tableTitle = useMemo(() => {
    if (!userId) return "Monthly entries";
    const emp = employees.find((e) => e.id === userId);
    const label = emp ? [emp.name, emp.employee_code].filter(Boolean).join(" · ") : userId;
    return `${label} — ${year}-${String(month).padStart(2, "0")}`;
  }, [employees, month, userId, year]);

  return (
    <div className="min-h-screen bg-[var(--background)] px-4 py-10 text-[var(--foreground)] sm:px-6">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="flex justify-start">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/80 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-emerald-200 dark:hover:border-emerald-600/40 dark:hover:bg-emerald-950/30"
          >
            <span aria-hidden>←</span>
            Back to dashboard
          </Link>
        </div>
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            Public entry
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Add attendance</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Submit IN / OUT times for one employee and date. This page is separate from the main app login.
          </p>
        </header>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
            {success}
          </div>
        )}

        <div className="rounded-3xl border border-zinc-200/80 bg-white/90 p-6 shadow-sm dark:border-zinc-800/80 dark:bg-zinc-950/60">
          <AttendanceEntryForm
            employees={employees}
            employeesLoading={employeesLoading}
            userId={userId}
            onUserIdChange={setUserId}
            date={date}
            onDateChange={setDate}
            onSubmit={handleSubmit}
            submitting={submitting}
            editFormKey={editFormKey}
            defaultInTime={prefillIn}
            defaultOutTime={prefillOut}
          />
        </div>

        <AttendanceEntryMonthTable
          rows={monthRows}
          loading={monthLoading}
          title={tableTitle}
          onEditRow={handleEditRow}
        />

        <p className="text-center text-xs text-zinc-500 dark:text-zinc-500">
          Secured with an optional link key. Set <code className="font-mono">ATTENDANCE_ENTRY_SECRET</code> on the
          server and open this page with <code className="font-mono">?key=…</code>.
        </p>
      </div>
    </div>
  );
}

export default function AttendanceEntryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">Loading…</div>
      }
    >
      <Inner />
    </Suspense>
  );
}

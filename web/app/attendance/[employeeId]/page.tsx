"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getStoredUser, type Role } from "@/lib/auth";

type AttendanceRow = {
  id?: string | null;
  employee_id: string;
  day: string;
  date: string;
  in_time?: string | null;
  out_time?: string | null;
  total_hours: number;
  working_hours: number;
  working_hours_display?: string;
  actual_hours: number;
  shortfall: number;
  shortfall_display?: string;
  present: string;
  absent: string;
  late_time: number;
  late_time_display?: string;
  time_value: number;
  status: "P" | "A";
  status_ot_sf: string;
  remarks?: string | null;
};

type Employee = {
  id: string;
  employee_code: string;
  name?: string | null;
  email?: string | null;
};

type MonthOption = {
  month: number;
  year: number;
};

type DisplayRow =
  | ({ kind: "attendance" } & AttendanceRow)
  | { kind: "total"; id: string; label: string; working_hours_display: string };

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });
}

const WEEKEND_AUTO_PRESENT_EMAILS = new Set(["adrija@industryprime.com"]);

/** Minutes from midnight; IN at or before this time is not late (same as backend). */
const LATE_CUTOFF_MINUTES = 9 * 60 + 31;

function hhmmToMinutes(value: unknown): number {
  if (value == null) return 0;
  const text = String(value).trim();
  if (!text) return 0;
  const [hRaw, mRaw = ""] = text.split(".", 2);
  const h = Number.parseInt(hRaw || "0", 10);
  if (Number.isNaN(h) || h < 0) return 0;
  const mmDigits = mRaw.replace(/\D/g, "");
  let mm = 0;
  if (mmDigits.length === 1) mm = Number.parseInt(mmDigits, 10) * 10;
  else if (mmDigits.length >= 2) mm = Number.parseInt(mmDigits.slice(0, 2), 10);
  if (Number.isNaN(mm) || mm < 0) mm = 0;
  if (mm > 59) mm = 59;
  return h * 60 + mm;
}

function minutesToHHMM(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return `${h}.${String(rem).padStart(2, "0")}`;
}

/** HTML time inputs use HH:MM; API may return HH:MM:SS. */
function normalizeTimeValue(value: string | null | undefined): string {
  if (!value?.trim()) return "";
  const s = value.trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  if (/^\d{1,2}:\d{2}$/.test(s)) return s;
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function calculateLocal(
  row: AttendanceRow,
  employeeEmail?: string | null,
  holidays?: Record<string, string> | null,
): AttendanceRow {
  const inTime = row.in_time || "";
  const outTime = row.out_time || "";
  const dateKey = row.date.slice(0, 10);
  const holidayLabel = holidays?.[dateKey];

  if (holidayLabel && !inTime && !outTime) {
    return {
      ...row,
      total_hours: 0,
      working_hours: 0,
      working_hours_display: "0.00",
      actual_hours: 0,
      shortfall: 0,
      shortfall_display: "0.00",
      present: "P",
      absent: "",
      late_time: 0,
      late_time_display: "0.00",
      time_value: 0,
      status: "P",
      status_ot_sf: holidayLabel,
    };
  }

  const dow = new Date(row.date).getDay();
  const isSaturday = dow === 6;
  const isSunday = dow === 0;
  const email = (employeeEmail || "").trim().toLowerCase();
  const weekendAuto =
    email && WEEKEND_AUTO_PRESENT_EMAILS.has(email) && (isSaturday || isSunday) && !inTime && !outTime;

  if (weekendAuto) {
    return {
      ...row,
      total_hours: 0,
      working_hours: 0,
      working_hours_display: "0.00",
      actual_hours: 0,
      shortfall: 0,
      shortfall_display: "0.00",
      present: "P",
      absent: "",
      late_time: 0,
      late_time_display: "0.00",
      time_value: 0,
      status: "P",
      status_ot_sf: isSaturday ? "Saturday" : "Sunday",
    };
  }

  if (isSunday && !inTime && !outTime) {
    return {
      ...row,
      total_hours: 0,
      working_hours: 0,
      working_hours_display: "0.00",
      actual_hours: 0,
      shortfall: 0,
      shortfall_display: "0.00",
      present: "P",
      absent: "",
      late_time: 0,
      late_time_display: "0.00",
      time_value: 0,
      status: "P",
      status_ot_sf: "Sunday",
    };
  }

  if (inTime && !outTime) {
    const [inH, inM] = inTime.split(":").map(Number);
    const inMinutes = inH * 60 + inM;
    const lateMinutes = Math.max(0, inMinutes - LATE_CUTOFF_MINUTES);
    const late = Number(minutesToHHMM(lateMinutes));
    return {
      ...row,
      total_hours: 0,
      working_hours: 0,
      working_hours_display: "0.00",
      actual_hours: 0,
      shortfall: 0,
      shortfall_display: "0.00",
      present: "P",
      absent: "",
      late_time: late,
      late_time_display: minutesToHHMM(lateMinutes),
      time_value: 0,
      status: "P",
      status_ot_sf: late > 0 ? "Late" : "OK",
    };
  }

  if (!inTime || !outTime) {
    return {
      ...row,
      working_hours: 0,
      working_hours_display: "0.00",
      actual_hours: 0,
      shortfall: row.total_hours,
      shortfall_display: minutesToHHMM(hhmmToMinutes(row.total_hours)),
      present: "",
      absent: "A",
      late_time: 0,
      late_time_display: "0.00",
      time_value: 0,
      status: "A",
      status_ot_sf: "Absent",
    };
  }

  const [inHour, inMinute] = inTime.split(":").map(Number);
  const [outHour, outMinute] = outTime.split(":").map(Number);
  const inMinutes = inHour * 60 + inMinute;
  const outMinutes = outHour * 60 + outMinute;
  if (outMinutes <= inMinutes) return row;

  const workingMinutes = Math.max(0, outMinutes - Math.max(inMinutes, 9 * 60));
  const workingDisplay = minutesToHHMM(workingMinutes);
  const working = Number(workingDisplay);
  const actual = working;
  const scheduledHours =
    isSaturday && !(email && WEEKEND_AUTO_PRESENT_EMAILS.has(email)) ? 5 : 9;
  const shortfallMinutes = Math.max(0, scheduledHours * 60 - workingMinutes);
  const shortfallDisplay = minutesToHHMM(shortfallMinutes);
  const shortfall = Number(shortfallDisplay);
  const lateMinutes = Math.max(0, inMinutes - LATE_CUTOFF_MINUTES);
  const lateDisplay = minutesToHHMM(lateMinutes);
  const late = Number(lateDisplay);
  const baseStatus = actual > scheduledHours ? "OT" : shortfall > 0 ? "SF" : "OK";
  return {
    ...row,
    working_hours: working,
    working_hours_display: workingDisplay,
    actual_hours: actual,
    shortfall,
    shortfall_display: shortfallDisplay,
    present: "P",
    absent: "",
    late_time: late,
    late_time_display: lateDisplay,
    time_value: actual,
    status: "P",
    status_ot_sf: late > 0 ? "Late" : baseStatus,
  };
}

export default function AttendanceDetailPage() {
  const params = useParams<{ employeeId: string }>();
  const searchParams = useSearchParams();
  const employeeId = params.employeeId;
  const now = new Date();
  const initialMonth = Number(searchParams.get("month")) || now.getMonth() + 1;
  const initialYear = Number(searchParams.get("year")) || now.getFullYear();
  const [month, setMonth] = useState(initialMonth);
  const [year, setYear] = useState(initialYear);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [role, setRole] = useState<Role | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [remarksModal, setRemarksModal] = useState<{
    row: AttendanceRow;
    remarks: string;
  } | null>(null);
  const rowsRef = useRef<AttendanceRow[]>([]);
  const baselineTimesRef = useRef<Map<string, { in: string; out: string }>>(new Map());
  const promptTimerRef = useRef<Map<string, number>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<Record<string, string>>({});

  rowsRef.current = rows;

  function syncBaselineTimes(nextRows: AttendanceRow[]) {
    const map = new Map<string, { in: string; out: string }>();
    for (const row of nextRows) {
      map.set(row.date, {
        in: normalizeTimeValue(row.in_time),
        out: normalizeTimeValue(row.out_time),
      });
    }
    baselineTimesRef.current = map;
  }

  function isTimeDirty(date: string, inTime?: string | null, outTime?: string | null): boolean {
    const base = baselineTimesRef.current.get(date) ?? { in: "", out: "" };
    return (
      normalizeTimeValue(inTime) !== base.in || normalizeTimeValue(outTime) !== base.out
    );
  }

  async function loadAttendance(selectedMonth = month, selectedYear = year) {
    setLoading(true);
    setError(null);
    try {
      const [attendance, employees, monthRows] = await Promise.all([
        apiFetch<{ rows: AttendanceRow[]; holidays?: Record<string, string> }>(
          `/attendance/${employeeId}?month=${selectedMonth}&year=${selectedYear}`
        ),
        apiFetch<Employee[]>("/employees?status=active"),
        apiFetch<MonthOption[]>(`/months/${employeeId}`),
      ]);
      setRows(attendance.rows);
      syncBaselineTimes(attendance.rows);
      setHolidays(attendance.holidays ?? {});
      setEmployee(employees.find((item) => item.id === employeeId) || null);
      setMonths(monthRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load attendance");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAttendance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId]);

  useEffect(() => {
    const syncRole = () => setRole(getStoredUser()?.role ?? null);
    syncRole();
    window.addEventListener("industryprime-auth-change", syncRole);
    return () => window.removeEventListener("industryprime-auth-change", syncRole);
  }, []);

  const canEditAttendance = role === "master_admin" || role === "admin";
  const canEditManualTimes = role === "master_admin";

  const displayRows = useMemo<DisplayRow[]>(() => {
    const output: DisplayRow[] = [];
    let weeklyWorkingMinutes = 0;
    for (const row of rows) {
      output.push({ ...row, kind: "attendance" });
      weeklyWorkingMinutes += hhmmToMinutes(row.working_hours_display ?? row.working_hours ?? 0);
      if (new Date(row.date).getDay() === 0) {
        output.push({
          kind: "total",
          id: `total-${row.date}`,
          label: "Total Working Hrs",
          working_hours_display: minutesToHHMM(weeklyWorkingMinutes),
        });
        weeklyWorkingMinutes = 0;
      }
    }
    return output;
  }, [rows]);

  function updateLocalRow(date: string, patch: Partial<AttendanceRow>) {
    setRows((items) =>
      items.map((row) =>
        row.date === date
          ? calculateLocal({ ...row, ...patch }, employee?.email, holidays)
          : row
      )
    );
  }

  function patchLocalRow(date: string, patch: Partial<AttendanceRow>) {
    setRows((items) =>
      items.map((row) => (row.date === date ? { ...row, ...patch } : row))
    );
  }

  async function saveRow(row: AttendanceRow, options?: { remarks?: string }) {
    if (!canEditAttendance) return;
    if (!row.in_time && row.out_time) {
      return;
    }
    if (row.in_time && row.out_time && row.out_time <= row.in_time) {
      setError("Out time must be greater than In time");
      return;
    }
    setSavingDate(row.date);
    setError(null);
    try {
      const updated = await apiFetch<AttendanceRow>("/attendance/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          date: row.date,
          in_time: row.in_time || null,
          out_time: row.out_time || null,
          total_hours: row.total_hours,
          working_hours: row.working_hours,
          shortfall: row.shortfall,
          status: row.status,
          late_time: row.late_time,
          time_value: row.time_value,
          status_ot_sf: row.status_ot_sf,
          remarks: options?.remarks ?? row.remarks ?? null,
        }),
      });
      setRows((items) => items.map((item) => (item.date === updated.date ? updated : item)));
      baselineTimesRef.current.set(updated.date, {
        in: normalizeTimeValue(updated.in_time),
        out: normalizeTimeValue(updated.out_time),
      });
      window.dispatchEvent(new Event("industryprime-attendance-change"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attendance");
    } finally {
      setSavingDate(null);
    }
  }

  function promptManualTimeSave(date: string) {
    if (!canEditManualTimes) return;
    const current = rowsRef.current.find((row) => row.date === date);
    if (!current) return;
    const inNorm = normalizeTimeValue(current.in_time);
    const outNorm = normalizeTimeValue(current.out_time);
    if (!isTimeDirty(date, current.in_time, current.out_time)) return;
    if (!inNorm && !outNorm) return;
    setRemarksModal({
      row: current,
      remarks: current.remarks?.trim() || "",
    });
  }

  function scheduleManualTimePrompt(date: string) {
    const prev = promptTimerRef.current.get(date);
    if (prev !== undefined) window.clearTimeout(prev);
    const id = window.setTimeout(() => {
      promptTimerRef.current.delete(date);
      promptManualTimeSave(date);
    }, 300);
    promptTimerRef.current.set(date, id);
  }

  function onManualTimeChange(date: string, patch: Partial<AttendanceRow>) {
    setRows((items) => {
      const next = items.map((row) =>
        row.date === date
          ? calculateLocal({ ...row, ...patch }, employee?.email, holidays)
          : row,
      );
      rowsRef.current = next;
      return next;
    });
    scheduleManualTimePrompt(date);
  }

  function cancelManualTimeModal() {
    const modal = remarksModal;
    if (modal) {
      const base = baselineTimesRef.current.get(modal.row.date);
      if (base) {
        const reverted = calculateLocal(
          { ...modal.row, in_time: base.in || null, out_time: base.out || null },
          employee?.email,
          holidays,
        );
        setRows((items) => {
          const next = items.map((row) => (row.date === modal.row.date ? reverted : row));
          rowsRef.current = next;
          return next;
        });
      }
    }
    setRemarksModal(null);
  }

  async function confirmManualTimeModal() {
    if (!remarksModal) return;
    const trimmed = remarksModal.remarks.trim();
    if (!trimmed) {
      setError("Remarks are required for manual In/Out time entry.");
      return;
    }
    const row = { ...remarksModal.row, remarks: trimmed };
    setRemarksModal(null);
    await saveRow(row, { remarks: trimmed });
  }

  function openManualTimeModalForDate(date: string) {
    const prev = promptTimerRef.current.get(date);
    if (prev !== undefined) window.clearTimeout(prev);
    promptManualTimeSave(date);
  }

  function onMonthChange(value: string) {
    const [nextYear, nextMonth] = value.split("-").map(Number);
    setYear(nextYear);
    setMonth(nextMonth);
    void loadAttendance(nextMonth, nextYear);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/attendance" className="text-xs font-semibold text-emerald-700">
            Back to employees
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            {employee?.name || "Employee"} Attendance
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {employee?.employee_code} · {monthLabel(month, year)}
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Month
          </label>
          <select
            value={`${year}-${month}`}
            onChange={(event) => onMonthChange(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/60 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
          >
            {months.map((item) => (
              <option key={`${item.year}-${item.month}`} value={`${item.year}-${item.month}`}>
                {monthLabel(item.month, item.year)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {canEditManualTimes ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Master Admin: set In/Out times manually — you will be asked for remarks before each save.
        </p>
      ) : null}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="max-h-[72vh] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-[1220px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <tr>
              {[
                "Day",
                "Date",
                "In Time",
                "Out Time",
                "Total Hrs.",
                "Working Hrs",
                "Shortfall",
                "Atten.",
                "Late Time",
                "Time",
                "Status OT/SF",
                "Remarks",
              ].map((title) => (
                <th key={title} className="border border-zinc-200 px-3 py-2 dark:border-zinc-800">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="px-4 py-12 text-center text-zinc-500">
                  Loading attendance...
                </td>
              </tr>
            ) : (
              displayRows.map((row) =>
                row.kind === "total" ? (
                  <tr key={row.id} className="bg-zinc-200 font-semibold dark:bg-zinc-800">
                    <td className="border border-zinc-300 px-3 py-2 dark:border-zinc-700" colSpan={5}>
                      {row.label}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2 dark:border-zinc-700">
                      {row.working_hours_display}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2 dark:border-zinc-700" colSpan={6} />
                  </tr>
                ) : (
                  <tr
                    key={row.date}
                    className={(() => {
                      const dateKey = row.date.slice(0, 10);
                      const holidayAuto =
                        Boolean(holidays[dateKey]) &&
                        !(row.in_time || "").trim() &&
                        !(row.out_time || "").trim();
                      if (row.status === "A") {
                        return "bg-red-50 text-red-950 dark:bg-red-950/30 dark:text-red-100";
                      }
                      if (row.status_ot_sf === "Late") {
                        return "bg-amber-50/90 text-amber-950 dark:bg-amber-950/25 dark:text-amber-100";
                      }
                      if (
                        holidayAuto ||
                        row.status_ot_sf === "Sunday" ||
                        row.status_ot_sf === "Saturday"
                      ) {
                        return "bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300";
                      }
                      return "bg-emerald-50/60 text-zinc-900 dark:bg-emerald-950/20 dark:text-zinc-100";
                    })()}
                  >
                    <Cell>{row.day}</Cell>
                    <Cell>{row.date}</Cell>
                    <EditableTime
                      value={normalizeTimeValue(row.in_time)}
                      disabled={!canEditManualTimes}
                      onChange={(value) => onManualTimeChange(row.date, { in_time: value })}
                      onBlur={() => scheduleManualTimePrompt(row.date)}
                    />
                    <EditableTime
                      value={normalizeTimeValue(row.out_time)}
                      disabled={!canEditManualTimes}
                      onChange={(value) => onManualTimeChange(row.date, { out_time: value })}
                      onBlur={() => scheduleManualTimePrompt(row.date)}
                    />
                    <EditableNumber value={row.total_hours} disabled={!canEditAttendance} onChange={(value) => patchLocalRow(row.date, { total_hours: value })} onBlur={(value) => void saveRow({ ...row, total_hours: value })} />
                    <Cell>{row.working_hours_display ?? minutesToHHMM(hhmmToMinutes(row.working_hours ?? 0))}</Cell>
                    <Cell>{row.shortfall_display ?? minutesToHHMM(hhmmToMinutes(row.shortfall ?? 0))}</Cell>
                    <EditableSelect
                      value={row.status}
                      disabled={!canEditAttendance}
                      options={["P", "A"]}
                      onChange={(value) =>
                        patchLocalRow(row.date, {
                          status: value as "P" | "A",
                          present: value === "P" ? "P" : "",
                          absent: value === "A" ? "A" : "",
                        })
                      }
                      onBlur={(value) =>
                        void saveRow({
                          ...row,
                          status: value as "P" | "A",
                          present: value === "P" ? "P" : "",
                          absent: value === "A" ? "A" : "",
                        })
                      }
                    />
                    <Cell>{row.late_time_display ?? minutesToHHMM(hhmmToMinutes(row.late_time ?? 0))}</Cell>
                    <EditableNumber value={row.time_value} disabled={!canEditAttendance} onChange={(value) => patchLocalRow(row.date, { time_value: value })} onBlur={(value) => void saveRow({ ...row, time_value: value })} />
                    <EditableText value={savingDate === row.date ? "Saving..." : row.status_ot_sf} disabled={!canEditAttendance} onChange={(value) => patchLocalRow(row.date, { status_ot_sf: value })} onBlur={(value) => void saveRow({ ...row, status_ot_sf: value })} />
                    <Cell>
                      {canEditManualTimes && isTimeDirty(row.date, row.in_time, row.out_time) ? (
                        <button
                          type="button"
                          onClick={() => openManualTimeModalForDate(row.date)}
                          className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                        >
                          Apply times
                        </button>
                      ) : (
                        <span className="line-clamp-2 max-w-[12rem]" title={row.remarks || undefined}>
                          {row.remarks?.trim() || "—"}
                        </span>
                      )}
                    </Cell>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>

      {remarksModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="attendance-remarks-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
            <h2 id="attendance-remarks-title" className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Remarks required
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {remarksModal.row.date} — explain why In/Out times were entered or changed manually.
            </p>
            <textarea
              value={remarksModal.remarks}
              onChange={(e) => setRemarksModal({ ...remarksModal, remarks: e.target.value })}
              rows={4}
              maxLength={2000}
              placeholder="e.g. Employee forgot to punch; verified with manager."
              className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-500/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelManualTimeModal}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmManualTimeModal()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Save attendance
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="border border-zinc-200 px-3 py-2 dark:border-zinc-800">{children}</td>;
}

function EditableText({
  value,
  disabled,
  onChange,
  onBlur,
}: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}) {
  return (
    <td className="border border-zinc-200 p-1 dark:border-zinc-800">
      <input
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur(event.target.value)}
        className="w-full bg-transparent px-2 py-1 outline-none focus:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:focus:bg-zinc-900"
      />
    </td>
  );
}

function EditableNumber({
  value,
  disabled,
  onChange,
  onBlur,
  decimals,
}: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onBlur: (value: number) => void;
  decimals?: number;
}) {
  const displayValue = decimals === undefined ? String(value) : Number(value || 0).toFixed(decimals);
  return (
    <td className="border border-zinc-200 p-1 dark:border-zinc-800">
      <input
        type="number"
        step="0.01"
        value={displayValue}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        onBlur={(event) => onBlur(Number(event.target.value))}
        className="w-full bg-transparent px-2 py-1 outline-none focus:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:focus:bg-zinc-900"
      />
    </td>
  );
}

function EditableSelect({
  value,
  disabled,
  options,
  onChange,
  onBlur,
}: {
  value: string;
  disabled?: boolean;
  options: string[];
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}) {
  return (
    <td className="border border-zinc-200 p-1 dark:border-zinc-800">
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur(event.target.value)}
        className="w-full bg-transparent px-2 py-1 outline-none focus:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:focus:bg-zinc-900"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </td>
  );
}

function EditableTime(props: {
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onBlur?: () => void;
}) {
  return (
    <td className="border border-zinc-200 p-1 dark:border-zinc-800">
      <input
        type="time"
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={() => props.onBlur?.()}
        className="w-full bg-transparent px-2 py-1 outline-none focus:bg-white disabled:cursor-not-allowed disabled:opacity-70 dark:focus:bg-zinc-900"
      />
    </td>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type AttendanceRow = {
  id?: string | null;
  employee_id: string;
  day: string;
  date: string;
  in_time?: string | null;
  out_time?: string | null;
  total_hours: number;
  working_hours: number;
  actual_hours: number;
  shortfall: number;
  present: string;
  absent: string;
  late_time: number;
  time_value: number;
  status: "P" | "A";
  status_ot_sf: string;
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
  | { kind: "total"; id: string; label: string; actual_hours: number };

function monthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleString("en", {
    month: "long",
    year: "numeric",
  });
}

const WEEKEND_AUTO_PRESENT_EMAILS = new Set(["adrija@industryprime.com"]);

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
      actual_hours: 0,
      shortfall: 0,
      present: "P",
      absent: "",
      late_time: 0,
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
      actual_hours: 0,
      shortfall: 0,
      present: "P",
      absent: "",
      late_time: 0,
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
      actual_hours: 0,
      shortfall: 0,
      present: "P",
      absent: "",
      late_time: 0,
      time_value: 0,
      status: "P",
      status_ot_sf: "Sunday",
    };
  }

  if (inTime && !outTime) {
    const [inH, inM] = inTime.split(":").map(Number);
    const inMinutes = inH * 60 + inM;
    const lateCutoff = 9 * 60 + 30;
    const late = Number(Math.max(0, (inMinutes - lateCutoff) / 60).toFixed(2));
    return {
      ...row,
      total_hours: 0,
      working_hours: 0,
      actual_hours: 0,
      shortfall: 0,
      present: "P",
      absent: "",
      late_time: late,
      time_value: 0,
      status: "P",
      status_ot_sf: late > 0 ? "Late" : "OK",
    };
  }

  if (!inTime || !outTime) {
    return {
      ...row,
      working_hours: 0,
      actual_hours: 0,
      shortfall: row.total_hours,
      present: "",
      absent: "A",
      late_time: 0,
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

  const working = Number(((outMinutes - inMinutes) / 60).toFixed(2));
  const actual = Number((Math.max(0, outMinutes - 9 * 60) / 60).toFixed(2));
  const scheduledHours =
    isSaturday && !(email && WEEKEND_AUTO_PRESENT_EMAILS.has(email)) ? 5 : 9;
  const shortfall = Number(Math.max(0, scheduledHours - actual).toFixed(2));
  const lateCutoff = 9 * 60 + 30;
  const late = Number(Math.max(0, (inMinutes - lateCutoff) / 60).toFixed(2));
  const baseStatus = actual > scheduledHours ? "OT" : shortfall > 0 ? "SF" : "OK";
  return {
    ...row,
    working_hours: working,
    actual_hours: actual,
    shortfall,
    present: "P",
    absent: "",
    late_time: late,
    time_value: actual,
    status: "P",
    status_ot_sf: late > 0 ? "Late" : baseStatus,
  };
}

export default function AttendanceDetailPage() {
  const params = useParams<{ employeeId: string }>();
  const employeeId = params.employeeId;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<Record<string, string>>({});

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

  const displayRows = useMemo<DisplayRow[]>(() => {
    const output: DisplayRow[] = [];
    let weeklyActual = 0;
    for (const row of rows) {
      output.push({ ...row, kind: "attendance" });
      weeklyActual += Number(row.actual_hours || 0);
      if (new Date(row.date).getDay() === 0) {
        output.push({
          kind: "total",
          id: `total-${row.date}`,
          label: "Total Working",
          actual_hours: Number(weeklyActual.toFixed(2)),
        });
        weeklyActual = 0;
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

  async function saveRow(row: AttendanceRow) {
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
          actual_hours: row.actual_hours,
          shortfall: row.shortfall,
          status: row.status,
          late_time: row.late_time,
          time_value: row.time_value,
          status_ot_sf: row.status_ot_sf,
        }),
      });
      setRows((items) => items.map((item) => (item.date === updated.date ? updated : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save attendance");
    } finally {
      setSavingDate(null);
    }
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

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="max-h-[72vh] overflow-auto rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <table className="min-w-[1350px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-100 text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <tr>
              {[
                "Day",
                "Date",
                "In Time",
                "Out Time",
                "Total Hrs.",
                "Working Hrs",
                "Actual",
                "Shortfall",
                "Atten.",
                "Late Time",
                "Time",
                "Status OT/SF",
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
                <td colSpan={13} className="px-4 py-12 text-center text-zinc-500">
                  Loading attendance...
                </td>
              </tr>
            ) : (
              displayRows.map((row) =>
                row.kind === "total" ? (
                  <tr key={row.id} className="bg-zinc-200 font-semibold dark:bg-zinc-800">
                    <td className="border border-zinc-300 px-3 py-2 dark:border-zinc-700" colSpan={6}>
                      {row.label}
                    </td>
                    <td className="border border-zinc-300 px-3 py-2 dark:border-zinc-700">
                      {row.actual_hours}
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
                      value={row.in_time || ""}
                      onChange={(value) => updateLocalRow(row.date, { in_time: value })}
                      onBlur={(value) =>
                        void saveRow(calculateLocal({ ...row, in_time: value }, employee?.email, holidays))
                      }
                    />
                    <EditableTime
                      value={row.out_time || ""}
                      onChange={(value) => updateLocalRow(row.date, { out_time: value })}
                      onBlur={(value) =>
                        void saveRow(calculateLocal({ ...row, out_time: value }, employee?.email, holidays))
                      }
                    />
                    <EditableNumber value={row.total_hours} onChange={(value) => patchLocalRow(row.date, { total_hours: value })} onBlur={(value) => void saveRow({ ...row, total_hours: value })} />
                    <EditableNumber value={row.working_hours} onChange={(value) => patchLocalRow(row.date, { working_hours: value })} onBlur={(value) => void saveRow({ ...row, working_hours: value })} />
                    <EditableNumber value={row.actual_hours} onChange={(value) => patchLocalRow(row.date, { actual_hours: value })} onBlur={(value) => void saveRow({ ...row, actual_hours: value })} />
                    <EditableNumber value={row.shortfall} onChange={(value) => patchLocalRow(row.date, { shortfall: value })} onBlur={(value) => void saveRow({ ...row, shortfall: value })} />
                    <EditableSelect
                      value={row.status}
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
                    <EditableNumber value={row.late_time} decimals={2} onChange={(value) => patchLocalRow(row.date, { late_time: value })} onBlur={(value) => void saveRow({ ...row, late_time: value })} />
                    <EditableNumber value={row.time_value} onChange={(value) => patchLocalRow(row.date, { time_value: value })} onBlur={(value) => void saveRow({ ...row, time_value: value })} />
                    <EditableText value={savingDate === row.date ? "Saving..." : row.status_ot_sf} onChange={(value) => patchLocalRow(row.date, { status_ot_sf: value })} onBlur={(value) => void saveRow({ ...row, status_ot_sf: value })} />
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="border border-zinc-200 px-3 py-2 dark:border-zinc-800">{children}</td>;
}

function EditableText({
  value,
  onChange,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}) {
  return (
    <td className="border border-zinc-200 p-1 dark:border-zinc-800">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur(event.target.value)}
        className="w-full bg-transparent px-2 py-1 outline-none focus:bg-white dark:focus:bg-zinc-900"
      />
    </td>
  );
}

function EditableNumber({
  value,
  onChange,
  onBlur,
  decimals,
}: {
  value: number;
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
        onChange={(event) => onChange(Number(event.target.value))}
        onBlur={(event) => onBlur(Number(event.target.value))}
        className="w-full bg-transparent px-2 py-1 outline-none focus:bg-white dark:focus:bg-zinc-900"
      />
    </td>
  );
}

function EditableSelect({
  value,
  options,
  onChange,
  onBlur,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onBlur: (value: string) => void;
}) {
  return (
    <td className="border border-zinc-200 p-1 dark:border-zinc-800">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onBlur(event.target.value)}
        className="w-full bg-transparent px-2 py-1 outline-none focus:bg-white dark:focus:bg-zinc-900"
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

function EditableTime(props: { value: string; onChange: (value: string) => void; onBlur: (value: string) => void }) {
  return (
    <td className="border border-zinc-200 p-1 dark:border-zinc-800">
      <input
        type="time"
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onBlur={(event) => props.onBlur(event.target.value)}
        className="w-full bg-transparent px-2 py-1 outline-none focus:bg-white dark:focus:bg-zinc-900"
      />
    </td>
  );
}

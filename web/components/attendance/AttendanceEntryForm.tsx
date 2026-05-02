"use client";

import { useEffect, useMemo, useState } from "react";
import EmployeeSelect from "./EmployeeSelect";

type Option = { id: string; name?: string | null; employee_code: string };

type Props = {
  employees: Option[];
  employeesLoading: boolean;
  userId: string;
  onUserIdChange: (value: string) => void;
  date: string;
  onDateChange: (value: string) => void;
  onSubmit: (payload: {
    user_id: string;
    date: string;
    in_time: string | null;
    out_time: string | null;
  }) => Promise<void>;
  submitting: boolean;
  /** When set (e.g. after clicking Edit on a month row), IN/OUT fields reload from these values. */
  editFormKey?: string | null;
  defaultInTime?: string;
  defaultOutTime?: string;
};

export default function AttendanceEntryForm({
  employees,
  employeesLoading,
  userId,
  onUserIdChange,
  date,
  onDateChange,
  onSubmit,
  submitting,
  editFormKey,
  defaultInTime = "",
  defaultOutTime = "",
}: Props) {
  const [inTime, setInTime] = useState("");
  const [outTime, setOutTime] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!editFormKey) return;
    setInTime(defaultInTime || "");
    setOutTime(defaultOutTime || "");
  }, [editFormKey, defaultInTime, defaultOutTime]);

  const canSubmit = useMemo(
    () => Boolean(userId && date && (inTime || outTime) && !submitting),
    [userId, date, inTime, outTime, submitting],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!userId) {
      setLocalError("Select a user.");
      return;
    }
    if (!inTime && !outTime) {
      setLocalError("Enter at least IN time or OUT time.");
      return;
    }
    try {
      await onSubmit({
        user_id: userId,
        date,
        in_time: inTime || null,
        out_time: outTime || null,
      });
      setInTime("");
      setOutTime("");
    } catch {
      /* error surfaced by parent */
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <EmployeeSelect
        options={employees}
        value={userId}
        onChange={onUserIdChange}
        loading={employeesLoading}
        disabled={submitting}
      />

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">Date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          disabled={submitting}
          className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">IN time</span>
          <input
            type="time"
            value={inTime}
            onChange={(e) => setInTime(e.target.value)}
            disabled={submitting}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">OUT time</span>
          <input
            type="time"
            value={outTime}
            onChange={(e) => setOutTime(e.target.value)}
            disabled={submitting}
            className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none focus:border-emerald-500/60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
      </div>

      {localError && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          {localError}
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Saving…" : "Save attendance"}
      </button>
    </form>
  );
}

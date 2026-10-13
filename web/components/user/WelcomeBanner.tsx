"use client";

import { format } from "date-fns";

import type { MeToday } from "@/lib/api/me";
import { formatTargetHr, formatWorkedHM } from "@/lib/user/attendanceDisplay";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

export function WelcomeBanner({
  firstName,
  today,
  shiftLine,
  reducedMotion,
}: {
  firstName: string;
  today: MeToday;
  shiftLine: string;
  reducedMotion: boolean;
}) {
  const working = today.status === "working" || today.status === "on_break";
  const sub = working
    ? `Worked today · ${formatWorkedHM(today.minutesWorked)} so far (target ${formatTargetHr(today.targetMinutes)}).`
    : today.status === "done"
      ? `Worked today · ${formatWorkedHM(today.minutesWorked)} (target ${formatTargetHr(today.targetMinutes)}).`
      : "Your attendance for today is loaded from company records. Check-in and check-out appear in the card below when recorded.";

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-r from-emerald-50 to-sky-50 p-6 shadow-sm ${
        reducedMotion ? "" : "motion-safe:transition"
      }`}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Secure workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Good {greeting()}, {firstName}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-500">{sub}</p>
          <p className="mt-3 text-xs text-zinc-900/80">{shiftLine}</p>
          <p className="mt-2 text-xs font-medium text-zinc-500">{format(new Date(), "EEEE · MMM d, yyyy")}</p>
        </div>
      </div>
    </div>
  );
}

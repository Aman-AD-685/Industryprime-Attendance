"use client";

import { useState } from "react";
import { MapPin, Pencil, Timer } from "lucide-react";
import { toast } from "sonner";

import type { MeToday, TodayStatus } from "@/lib/api/me";
import { formatTargetHr, formatWorkedHM } from "@/lib/user/attendanceDisplay";

const statusLabel: Record<TodayStatus, string> = {
  not_started: "Not started",
  working: "Working",
  on_break: "On break",
  done: "Done",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function TodayCard({
  today,
  reducedMotion,
  onSaveNote,
  noteBusy,
}: {
  today: MeToday;
  reducedMotion: boolean;
  onSaveNote: (note: string) => Promise<unknown>;
  noteBusy: boolean;
}) {
  const [dlg, setDlg] = useState(false);
  const [draft, setDraft] = useState(today.note ?? "");

  const pct = Math.min(100, (today.minutesWorked / Math.max(1, today.targetMinutes)) * 100);
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = c * (1 - pct / 100);

  return (
    <div className="rounded-2xl border border-[#E5EAE8] bg-white p-6 shadow-sm lg:col-span-7">
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-6">
        <div className="flex flex-col items-center justify-center">
          <div className="relative h-40 w-40">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
              <circle cx="60" cy="60" r={r} fill="none" stroke="#E5EAE8" strokeWidth="10" />
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke="#10B981"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={dash}
                className={reducedMotion ? "" : "motion-safe:transition-[stroke-dashoffset] duration-500"}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-2 text-center">
              <span className="text-xs font-semibold uppercase tracking-wide text-[#5C6B66]">Worked</span>
              <span className="text-2xl font-bold tabular-nums leading-none text-[#0F1F1B]">
                {formatWorkedHM(today.minutesWorked)}
              </span>
              <span className="text-sm font-semibold tabular-nums leading-snug text-[#0F1F1B]/75">
                / {formatTargetHr(today.targetMinutes)}
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="col-span-2">
            <p className="text-xs font-bold uppercase tracking-wide text-[#0F1F1B]">Status</p>
            <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-[#E5EAE8] bg-[#F7FAF9] px-2.5 py-1 text-xs font-semibold text-[#0F1F1B]">
              <Timer className="h-3.5 w-3.5 text-[#10B981]" aria-hidden />
              {statusLabel[today.status]}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#0F1F1B]">Check-in</p>
            <p className="mt-1 font-medium text-[#0F1F1B]">{fmtTime(today.checkInAt)}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#0F1F1B]">Check-out</p>
            <p className="mt-1 font-medium text-[#0F1F1B]">{fmtTime(today.checkOutAt)}</p>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-[#0F1F1B]">Location</p>
            <p className="mt-1 inline-flex min-w-0 items-center gap-1.5 font-medium text-[#0F1F1B]">
              <MapPin className="h-4 w-4 shrink-0 text-[#3B82F6]" aria-hidden />
              <span className="min-w-0 break-words">{today.location || "—"}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-[#0F1F1B]">Shift</p>
            <p className="mt-1 font-medium text-[#0F1F1B]">{today.shiftName || "—"}</p>
          </div>
          <div className="col-span-2 flex items-center justify-between border-t border-[#E5EAE8] pt-3">
            <p className="text-xs text-[#7A8784]">Note: {today.note?.trim() ? today.note : "—"}</p>
            <button
              type="button"
              onClick={() => {
                setDraft(today.note ?? "");
                setDlg(true);
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-[#E5EAE8] px-2 py-1 text-xs font-semibold text-[#0F1F1B] hover:bg-[#F7FAF9]"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Add a note
            </button>
          </div>
        </div>
      </div>

      {dlg ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDlg(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Attendance note"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-[#0F1F1B]">Note for today</h2>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="mt-3 w-full rounded-xl border border-[#E5EAE8] p-3 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl px-3 py-2 text-sm text-[#7A8784]" onClick={() => setDlg(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={noteBusy}
                onClick={() =>
                  void onSaveNote(draft)
                    .then(() => {
                      toast.success("Note saved");
                      setDlg(false);
                    })
                    .catch((e) => toast.error(e instanceof Error ? e.message : "Save failed"))
                }
                className="rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {noteBusy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

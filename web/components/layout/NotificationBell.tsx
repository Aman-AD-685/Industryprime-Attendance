"use client";

import { useEffect, useRef, useState } from "react";
import { IconBell } from "./icons";

type Notification = { id: string; title: string; time: string };

const mockNotifications: Notification[] = [
  { id: "1", title: "Aman checked in at 9:12", time: "2m ago" },
  { id: "2", title: "Payroll generated", time: "Yesterday" },
  { id: "3", title: "Attendance rules updated", time: "2 days ago" },
];

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white/70 text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
      >
        <IconBell className="h-5 w-5" />
        <span
          className="absolute right-1 top-1 inline-flex h-2.5 w-2.5 items-center justify-center rounded-full bg-rose-500 ring-2 ring-white dark:ring-zinc-950"
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-2xl border border-zinc-200 bg-white/85 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70"
          role="menu"
          aria-label="Notification list"
        >
          <div className="px-4 py-3">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Notifications
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              You have {mockNotifications.length} updates
            </div>
          </div>

          <div className="max-h-[320px] overflow-auto border-t border-zinc-200/60 dark:border-zinc-800/60">
            {mockNotifications.map((n) => (
              <div
                key={n.id}
                className="flex items-start gap-3 px-4 py-3 transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                role="menuitem"
              >
                <div className="mt-1 h-2 w-2 rounded-full bg-emerald-500" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {n.title}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">
                    {n.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


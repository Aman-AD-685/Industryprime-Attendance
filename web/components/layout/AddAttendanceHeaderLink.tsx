"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";

function withFromAppParam(url: string): string {
  if (url.includes("from=app")) return url;
  return url.includes("?") ? `${url}&from=app` : `${url}?from=app`;
}

function sameOriginAttendanceEntryUrl(apiUrl: string): string {
  if (typeof window === "undefined") return apiUrl;
  try {
    const parsed = new URL(apiUrl, window.location.origin);
    if (parsed.pathname === "/attendance-entry") {
      return `${window.location.origin}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* keep */
  }
  return apiUrl;
}

export default function AddAttendanceHeaderLink() {
  const [manualHref, setManualHref] = useState("/attendance-entry?from=app");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await apiFetch<{ url: string }>("/dashboard/attendance-entry-url");
        if (!cancelled && json?.url) {
          setManualHref(withFromAppParam(sameOriginAttendanceEntryUrl(json.url)));
        }
      } catch {
        if (!cancelled && typeof window !== "undefined") {
          setManualHref(withFromAppParam(`${window.location.origin}/attendance-entry`));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex shrink-0 items-center rounded-2xl border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm transition sm:px-3 sm:py-2 sm:text-sm",
          "hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50",
        )}
      >
        Add Attendance <span className="ml-1 opacity-70">▾</span>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] overflow-hidden rounded-2xl border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
          role="menu"
        >
          <a
            href={manualHref}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 font-medium text-zinc-900 hover:bg-emerald-50 dark:text-zinc-100 dark:hover:bg-emerald-950/60"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Enter Atten.
          </a>
          <Link
            href="/attendance/upload-pdf"
            className="block px-3 py-2 font-medium text-zinc-900 hover:bg-emerald-50 dark:text-zinc-100 dark:hover:bg-emerald-950/60"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            Upload
          </Link>
        </div>
      ) : null}
    </div>
  );
}

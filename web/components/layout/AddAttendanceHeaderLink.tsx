"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
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

type AddAttendanceHeaderLinkProps = {
  /** Solid green button (matches former dashboard header strip). */
  variant?: "default" | "solid";
};

export default function AddAttendanceHeaderLink({ variant = "default" }: AddAttendanceHeaderLinkProps) {
  const [manualHref, setManualHref] = useState("/attendance-entry?from=app");
  const [open, setOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
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
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setUploadOpen(false);
      }
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
          "inline-flex shrink-0 items-center rounded-2xl px-2 py-1.5 text-xs font-semibold shadow-sm transition sm:px-3 sm:py-2 sm:text-sm",
          variant === "solid"
            ? "gap-1 border border-emerald-600 bg-[#10B981] text-white hover:bg-emerald-600 dark:border-emerald-500 dark:hover:bg-emerald-500"
            : cn(
                "border border-emerald-300 bg-white text-emerald-800",
                "hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50",
              ),
        )}
      >
        {variant === "solid" ? <Plus className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden /> : null}
        <span className="sm:hidden">Add</span>
        <span className="hidden sm:inline">Add Attendance</span>{" "}
        <span className={cn("ml-0.5 opacity-70 sm:ml-1", variant === "solid" && "text-white/90")}>▾</span>
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-1 min-w-[13rem] overflow-visible rounded-2xl border border-zinc-200 bg-white py-1 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
          role="menu"
        >
          <a
            href={manualHref}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 font-medium text-zinc-900 hover:bg-emerald-50 dark:text-zinc-100 dark:hover:bg-emerald-950/60"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setUploadOpen(false);
            }}
          >
            Enter Atten.
          </a>
          <div className="border-t border-zinc-100 dark:border-zinc-800" />
          <button
            type="button"
            className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-zinc-900 hover:bg-emerald-50 dark:text-zinc-100 dark:hover:bg-emerald-950/60"
            aria-expanded={uploadOpen}
            onClick={(e) => {
              e.stopPropagation();
              setUploadOpen((u) => !u);
            }}
          >
            Upload
            <span className="text-zinc-400">{uploadOpen ? "▾" : "▸"}</span>
          </button>
          {uploadOpen ? (
            <div className="border-t border-zinc-100 bg-zinc-50/90 py-1 dark:border-zinc-800 dark:bg-zinc-900/50">
              <Link
                href="/attendance/upload-pdf"
                className="block px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100/80 dark:text-emerald-200 dark:hover:bg-emerald-950/80"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setUploadOpen(false);
                }}
              >
                PDF (daily report)
              </Link>
              <p className="px-4 pb-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                Upload a daily attendance PDF; results show on this page, then on each employee&apos;s sheet.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

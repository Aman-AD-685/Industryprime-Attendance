"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/cn";

function withFromAppParam(url: string): string {
  if (url.includes("from=app")) return url;
  return url.includes("?") ? `${url}&from=app` : `${url}?from=app`;
}

/** Backend uses FRONTEND_URL (often still localhost in prod). Same-app entry must open on the origin the user is on. */
function sameOriginAttendanceEntryUrl(apiUrl: string): string {
  if (typeof window === "undefined") return apiUrl;
  try {
    const parsed = new URL(apiUrl, window.location.origin);
    if (parsed.pathname === "/attendance-entry") {
      return `${window.location.origin}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* keep apiUrl */
  }
  return apiUrl;
}

export default function AddAttendanceHeaderLink() {
  const [href, setHref] = useState("/attendance-entry?from=app");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await apiFetch<{ url: string }>("/dashboard/attendance-entry-url");
        if (!cancelled && json?.url) setHref(withFromAppParam(sameOriginAttendanceEntryUrl(json.url)));
      } catch {
        if (!cancelled && typeof window !== "undefined") {
          setHref(withFromAppParam(`${window.location.origin}/attendance-entry`));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex shrink-0 items-center rounded-2xl border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm transition sm:px-3 sm:py-2 sm:text-sm",
        "hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-100 dark:hover:bg-emerald-900/50",
      )}
    >
      Add Attendance
    </a>
  );
}

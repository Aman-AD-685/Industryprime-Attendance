"use client";

import Link from "next/link";
import { useState } from "react";

export function LeaveRequestDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex flex-1 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-center text-sm font-semibold text-zinc-900 shadow-sm"
      >
        + Request leave
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Request leave"
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold text-zinc-900">Request leave</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Submit and track requests on the Leave page. This dialog is a shortcut — your org rules still apply.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl px-3 py-2 text-sm text-zinc-500" onClick={() => setOpen(false)}>
                Close
              </button>
              <Link
                href="/leave"
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setOpen(false)}
              >
                Open Leave
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

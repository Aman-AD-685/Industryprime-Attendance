"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchAdminAudit } from "@/lib/api/admin";

export function AuditLogStrip() {
  const [open, setOpen] = useState<Record<string, unknown> | null>(null);
  const q = useQuery({
    queryKey: ["admin-audit"],
    queryFn: fetchAdminAudit,
    refetchInterval: 60_000,
  });

  if (q.isError) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Audit log unavailable ({q.error instanceof Error ? q.error.message : "error"})
      </div>
    );
  }

  const events = q.data?.events ?? [];

  return (
    <>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-zinc-900">Audit log (last 20)</h3>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {q.isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-8 w-40 shrink-0 animate-pulse rounded-full bg-zinc-200" />
              ))
            : events.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() =>
                    setOpen({
                      id: e.id,
                      at: e.at,
                      actor: e.actor,
                      action: e.action,
                      target: e.target,
                      payload: e.payload,
                    })
                  }
                  className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-left text-xs text-zinc-900 hover:border-emerald-500"
                >
                  <span className="font-mono text-[10px] text-zinc-500">
                    {new Date(e.at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="mx-1 text-zinc-500">·</span>
                  <span className="font-semibold">{e.actor}</span>
                  <span className="text-zinc-500"> · </span>
                  {e.action} <span className="text-zinc-500">·</span> {e.target}
                </button>
              ))}
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => setOpen(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Audit event detail"
            className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-4 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-zinc-900">Event payload</h4>
              <button type="button" className="text-sm font-medium text-emerald-500" onClick={() => setOpen(null)}>
                Close
              </button>
            </div>
            <pre className="mt-3 max-h-[60vh] overflow-auto rounded-xl bg-zinc-900 p-3 text-xs text-emerald-100">
              {JSON.stringify(open, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </>
  );
}

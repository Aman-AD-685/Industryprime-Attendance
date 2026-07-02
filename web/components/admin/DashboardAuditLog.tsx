"use client";

import { formatDistanceToNow } from "date-fns";
import { useState } from "react";

import { Badge, Card, CardHeader, CardTitle } from "@/components/ui/dashboard-ui";
import { useSession } from "@/lib/hooks/useSession";
import { useAudit } from "@/lib/hooks/useAdminDashboard";
import type { AuditEvent } from "@/lib/admin/dashboardMockStore";

const roleBadge: Record<string, string> = {
  master_admin: "Master Admin",
  admin: "Admin",
  user: "User",
};

export function DashboardAuditLog() {
  const q = useAudit(20);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const { user } = useSession();

  if (q.isError) {
    return (
      <Card>
        <p className="text-sm text-red-800">
          Recent activity unavailable ({q.error instanceof Error ? q.error.message : "error"}).
        </p>
      </Card>
    );
  }

  const events = q.data ?? [];
  const showSkeleton = q.isPending && q.data === undefined;

  return (
    <>
      <Card>
        <CardHeader className="mb-2 flex-row items-center justify-between gap-2">
          <CardTitle>Recent activity</CardTitle>
          <Badge className="shrink-0 border-emerald-200 bg-emerald-50 text-emerald-800">
            {user?.role ? roleBadge[user.role] ?? user.role : "—"}
          </Badge>
        </CardHeader>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {showSkeleton
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-[#E5EAE8]" />
              ))
            : events.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setOpen(e)}
                  className="min-w-0 rounded-xl border border-[#E5EAE8] bg-[#F7FAF9] px-3 py-2.5 text-left text-xs text-[#0F1F1B] transition hover:border-[#10B981] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                >
                  <span className="block font-mono text-[10px] text-[#7A8784]">
                    {formatDistanceToNow(new Date(e.ts), { addSuffix: true })}
                  </span>
                  <span className="mt-1 block break-words">
                    <span className="font-semibold">{e.actor}</span>
                    <span className="text-[#7A8784]"> · </span>
                    {e.action}
                    <span className="text-[#7A8784]"> · </span>
                    <span className="break-all">{e.target}</span>
                  </span>
                </button>
              ))}
        </div>
      </Card>

      {open ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="presentation" onClick={() => setOpen(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Audit event"
            className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-4 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-[#0F1F1B]">Event detail</h4>
              <button
                type="button"
                className="text-sm font-medium text-[#10B981] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                onClick={() => setOpen(null)}
              >
                Close
              </button>
            </div>
            <pre className="mt-3 max-h-[60vh] overflow-auto rounded-xl bg-[#0F1F1B] p-3 text-xs text-emerald-100">
              {JSON.stringify(open, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </>
  );
}

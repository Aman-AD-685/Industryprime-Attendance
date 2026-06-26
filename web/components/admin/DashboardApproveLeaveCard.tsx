"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

import { Badge, Button, Card, CardTitle, Skeleton } from "@/components/ui/dashboard-ui";
import type { LeaveRequest } from "@/lib/admin/dashboardMockStore";
import type { ApprovedLeaveRow } from "@/lib/api/admin";
import {
  useApprovedLeaves,
  useLeaveDecisionMutation,
  usePendingLeaves,
} from "@/lib/hooks/useAdminDashboard";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/permissions";

const typeLabel: Record<LeaveRequest["type"], string> = {
  casual: "Casual leave",
  sick: "Sick leave",
  earned: "Earned leave",
};

function fmtRange(from?: string | null, to?: string | null) {
  if (!from) return "—";
  try {
    const a = format(parseISO(from.slice(0, 10)), "MMM d");
    const b = to ? format(parseISO(to.slice(0, 10)), "MMM d") : a;
    return from.slice(0, 10) === (to || from).slice(0, 10) ? a : `${a} – ${b}`;
  } catch {
    return `${from} – ${to || from}`;
  }
}

function approverLabel(row: ApprovedLeaveRow) {
  return row.approved_by || row.decided_by_email || "—";
}

export function DashboardApproveLeaveCard({ role }: { role: Role }) {
  const pendingQ = usePendingLeaves();
  const approvedQ = useApprovedLeaves();
  const decision = useLeaveDecisionMutation();

  const pendingRows = pendingQ.data ?? [];
  const approvedRows = approvedQ.data ?? [];
  const allowDecision = can.approveLeave(role);
  const isLoading = pendingQ.isLoading || approvedQ.isLoading;
  const error = pendingQ.error || approvedQ.error;

  return (
    <Card className="flex min-h-[320px] min-w-0 w-full flex-col lg:col-span-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <ClipboardCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <CardTitle className="mb-0">Pending for Approval</CardTitle>
            <p className="mt-0.5 text-xs text-[#7A8784]">Pending approvals and approved leave</p>
          </div>
        </div>
      </div>

      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#7A8784]">
        {pendingRows.length} pending · {approvedRows.length} approved
      </p>

      {isLoading ? (
        <div className="flex flex-1 flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-rose-700">{error instanceof Error ? error.message : "Failed to load"}</p>
      ) : pendingRows.length === 0 && approvedRows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-[#F7FAF9] px-4 py-8 text-center">
          <p className="text-sm font-medium text-[#0F1F1B]">No leave approvals to show</p>
          <p className="mt-1 text-xs text-[#7A8784]">Pending requests and approved leave will appear here.</p>
        </div>
      ) : (
        <div className="max-h-[340px] flex-1 space-y-4 overflow-y-auto pr-1">
          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#7A8784]">Pending</p>
              <Badge className="border-0 bg-[#E04F4F] px-2 py-0.5 text-xs font-bold text-white">
                {pendingRows.length}
              </Badge>
            </div>
            {pendingRows.length === 0 ? (
              <p className="rounded-xl bg-[#F7FAF9] px-3 py-4 text-center text-sm text-[#7A8784]">
                No pending approvals
              </p>
            ) : (
              <ul className="space-y-2">
                {pendingRows.map((row) => (
                  <li key={row.id} className="rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0F1F1B]">{row.name}</p>
                        <p className="mt-0.5 text-xs text-[#7A8784]">
                          {typeLabel[row.type]} · {fmtRange(row.from, row.to)} · {row.days}{" "}
                          {row.days === 1 ? "day" : "days"}
                        </p>
                        <p className="mt-1 text-xs text-[#7A8784]">{row.reason}</p>
                      </div>
                      <Button
                        className="h-8 px-3 py-1.5 text-xs"
                        disabled={!allowDecision || decision.isPending}
                        onClick={() =>
                          void decision.mutateAsync({ id: row.id, decision: "approve" }).then(() => {
                            toast.success(`${row.name}'s leave approved`);
                          })
                        }
                      >
                        Approve
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#7A8784]">
              Approved
            </p>
            {approvedRows.length === 0 ? (
              <p className="rounded-xl bg-[#F7FAF9] px-3 py-4 text-center text-sm text-[#7A8784]">
                No approved leave
              </p>
            ) : (
              <ul className="space-y-2">
                {approvedRows.map((row) => (
                  <li key={row.id} className="rounded-xl border border-[#E5EAE8] bg-[#F7FAF9] px-3 py-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#0F1F1B]">
                          {row.employee_name || row.employee_code || "Employee"}
                        </p>
                        <p className="mt-0.5 text-xs text-[#7A8784]">
                          {row.leave_type || "Leave"} · {fmtRange(row.leave_date_start, row.leave_date_end)}
                          {row.days != null && row.days > 0 ? ` · ${row.days}d` : ""}
                        </p>
                        <p className="mt-1 text-[11px] text-[#7A8784]">By {approverLabel(row)}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                          Approved
                        </span>
                        <Button
                          variant="outline"
                          className="h-8 px-3 py-1.5 text-xs"
                          disabled={!allowDecision || decision.isPending}
                          onClick={() =>
                            void decision.mutateAsync({ id: row.id, decision: "unapprove" }).then(() => {
                              toast.success("Leave unapproved");
                            })
                          }
                        >
                          Unapprove
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <div className="mt-4 border-t border-[#E5EAE8] pt-4">
        <Link
          href="/leave"
          className="text-xs font-semibold text-[#10B981] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          Manage all leave requests →
        </Link>
      </div>
    </Card>
  );
}

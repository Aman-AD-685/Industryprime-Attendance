"use client";

import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";

import { Avatar, Badge, Button, Card, CardHeader, CardTitle } from "@/components/ui/dashboard-ui";
import { useLeaveDecisionMutation, usePendingLeaves } from "@/lib/hooks/useAdminDashboard";
import type { LeaveRequest } from "@/lib/admin/dashboardMockStore";
import { can } from "@/lib/permissions";
import type { Role } from "@/lib/permissions";

const typeLabel: Record<LeaveRequest["type"], string> = {
  casual: "Casual leave",
  sick: "Sick leave",
  earned: "Earned leave",
};

function fmtRange(from: string, to: string) {
  try {
    return `${format(parseISO(from), "MMM d")} – ${format(parseISO(to), "MMM d")}`;
  } catch {
    return `${from} – ${to}`;
  }
}

export function DashboardPendingLeaves({
  role,
  canApproveLeave = false,
}: {
  role: Role;
  canApproveLeave?: boolean;
}) {
  const q = usePendingLeaves();
  const decision = useLeaveDecisionMutation();

  const allow = can.approveLeave(role, canApproveLeave);

  if (!q.data?.length) {
    return (
      <Card className="min-w-0 w-full lg:col-span-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <CardTitle className="mb-0">Pending leave approvals</CardTitle>
          <Badge className="border-0 bg-[#E04F4F] px-2 py-0.5 text-xs font-bold text-white">0</Badge>
        </div>
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-[#7A8784]">
          <span className="text-3xl" aria-hidden>
            ✓
          </span>
          <p className="font-semibold text-[#0F1F1B]">No pending approvals</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="min-w-0 w-full lg:col-span-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <CardTitle className="mb-0">Pending leave approvals</CardTitle>
        <Badge className="border-0 bg-[#E04F4F] px-2 py-0.5 text-xs font-bold text-white">
          {q.data.length > 99 ? "99+" : q.data.length}
        </Badge>
      </div>
      <div className="flex max-h-[450px] flex-col gap-3 overflow-y-auto pr-1">
        {q.data.map((lv) => (
          <div key={lv.id} className="rounded-xl bg-[#F7FAF9] p-4">
            <div className="flex items-start gap-3">
              <Avatar className="bg-white shadow-sm">{initials(lv.name)}</Avatar>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[#0F1F1B]">{lv.name}</p>
                <p className="text-xs text-[#7A8784]">{lv.dept}</p>
                <p className="mt-2 inline-flex flex-wrap items-center gap-1 text-xs text-[#7A8784]">
                  <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#3B82F6]" aria-hidden />
                  <span className="font-medium text-[#0F1F1B]">{typeLabel[lv.type]}</span>
                  <span>· {fmtRange(lv.from, lv.to)}</span>
                  <span>
                    · {lv.days} {lv.days === 1 ? "day" : "days"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-[#7A8784]">{lv.reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    className="h-9 px-3 py-2 text-xs"
                    disabled={!allow || decision.isPending}
                    onClick={() =>
                      void decision
                        .mutateAsync({ id: lv.id, decision: "approve" })
                        .then(() => {
                          toast.success(`${lv.name}'s leave approved`);
                        })
                        .catch((err: unknown) => {
                          toast.error(err instanceof Error ? err.message : "Could not approve leave");
                        })
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    className="h-9 px-3 py-2 text-xs"
                    disabled={!allow || decision.isPending}
                    onClick={() =>
                      void decision
                        .mutateAsync({ id: lv.id, decision: "reject" })
                        .then(() => {
                          toast.success("Leave request rejected");
                        })
                        .catch((err: unknown) => {
                          toast.error(err instanceof Error ? err.message : "Could not reject leave");
                        })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

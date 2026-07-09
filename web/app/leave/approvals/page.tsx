"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { DashboardApproveLeaveCard } from "@/components/admin/DashboardApproveLeaveCard";
import { getStoredUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

export default function LeaveApprovalsPage() {
  const router = useRouter();
  const user = getStoredUser();
  const allowed = user && can.approveLeave(user.role, Boolean(user.can_approve_leave));

  useEffect(() => {
    if (user && !allowed) {
      router.replace("/dashboard/user");
    }
  }, [allowed, router, user]);

  if (!user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[#7A8784]">
        Loading…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-[#E5EAE8] bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-[#E04F4F]">No leave approval access</p>
        <p className="mt-2 text-sm text-[#7A8784]">
          Ask a Master Admin to add your email under Settings → Email lists (Approval), or use the Approve link from
          your email.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[#0F1F1B]">Pending leave approvals</h1>
        <p className="mt-1 text-sm text-[#7A8784]">
          You can approve requests here or from the secure link in your approval email.
        </p>
      </div>
      <DashboardApproveLeaveCard role={user.role} canApproveLeave={Boolean(user.can_approve_leave)} />
    </div>
  );
}

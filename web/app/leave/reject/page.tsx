"use client";

import { Suspense } from "react";
import { LeaveEmailDecisionFlow } from "@/components/leave/LeaveEmailDecisionFlow";

function RejectPageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
      <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading…</p>
    </div>
  );
}

export default function LeaveRejectPage() {
  return (
    <Suspense fallback={<RejectPageFallback />}>
      <LeaveEmailDecisionFlow mode="reject" />
    </Suspense>
  );
}

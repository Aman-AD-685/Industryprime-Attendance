"use client";

import { useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";

/**
 * Legacy email links used `/leave/requests/{id}/decide`.
 * Redirect to the production-safe routes `/leave/decision` and `/leave/reject`.
 */
export default function LegacyLeaveDecideRedirect() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();

  useEffect(() => {
    const id = (params?.id || "").trim();
    const token = (search.get("token") || "").trim();
    const action = (search.get("action") || "approve").trim().toLowerCase();
    if (!id || !token) return;
    const q = new URLSearchParams({ leave_id: id, token });
    if (action === "reject") {
      window.location.replace(`/leave/reject?${q.toString()}`);
    } else {
      q.set("action", "approve");
      window.location.replace(`/leave/decision?${q.toString()}`);
    }
  }, [params, search]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-zinc-500">
      Redirecting to the secure decision page…
    </div>
  );
}

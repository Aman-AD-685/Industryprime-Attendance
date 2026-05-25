"use client";

import { Suspense, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";

function LegacyRedirectFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-zinc-500">
      Redirecting…
    </div>
  );
}

/** Legacy `/leaves/{id}/decide` links → token-based `/leave/decision` or `/leave/reject`. */
export default function LegacyLeavesDecideRedirect() {
  return (
    <Suspense fallback={<LegacyRedirectFallback />}>
      <LegacyLeavesDecideRedirectInner />
    </Suspense>
  );
}

function LegacyLeavesDecideRedirectInner() {
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

  return <LegacyRedirectFallback />;
}

"use client";

import { formatDistanceToNow } from "date-fns";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Badge, Button } from "@/components/ui/dashboard-ui";
import { adminDashboardKeys, useKpis } from "@/lib/hooks/useAdminDashboard";
import { cn } from "@/lib/cn";
import type { Role } from "@/lib/permissions";

export function PageHeader({ role }: { role: Role }) {
  const qc = useQueryClient();
  const kpis = useKpis();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const fn = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const lastRefreshedIso = kpis.dataUpdatedAt ? new Date(kpis.dataUpdatedAt).toISOString() : null;
  const isFetching = kpis.isFetching;

  const time =
    lastRefreshedIso != null
      ? new Date(lastRefreshedIso).toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        })
      : "—";

  const rel = lastRefreshedIso ? formatDistanceToNow(new Date(lastRefreshedIso), { addSuffix: true }) : "";

  return (
    <div className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight text-zinc-900">Attendance Overview</h2>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500",
              !reduceMotion && isFetching && "opacity-80",
            )}
            title={rel ? `Last refresh ${rel}` : undefined}
          >
            {!reduceMotion ? (
              <span className="relative flex h-2 w-2">
                {!isFetching ? (
                  <>
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </>
                ) : (
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                )}
              </span>
            ) : (
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
            )}
          </span>
        </div>
        <p className="mt-1 text-sm font-medium leading-relaxed text-zinc-700">
          Live data · Last refreshed <span className="font-semibold tabular-nums text-zinc-900">{time}</span>
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:pl-2">
        <Badge className="border-emerald-200 bg-emerald-50 font-bold text-emerald-800">
          {role === "master_admin" ? "Master Admin" : "Admin"}
        </Badge>
        <Button
          variant="outline"
          className="px-3 py-2 text-xs"
          aria-label="Reload dashboard data now"
          onClick={() => {
            void qc.invalidateQueries({ queryKey: adminDashboardKeys.all });
            void kpis.refetch();
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Reload
        </Button>
      </div>
    </div>
  );
}

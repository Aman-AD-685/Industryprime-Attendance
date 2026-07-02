"use client";

import type { ReactNode } from "react";

import { Card, Progress, Skeleton } from "@/components/ui/dashboard-ui";
import { useKpis } from "@/lib/hooks/useAdminDashboard";
import { cn } from "@/lib/cn";

export function KpiStrip() {
  const q = useKpis();
  const showSkeleton = q.isPending && !q.data;

  if (showSkeleton) {
    return (
      <div className="grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="min-w-0 w-full">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-9 w-20" />
            <Skeleton className="mt-2 h-3 w-32" />
          </Card>
        ))}
      </div>
    );
  }

  const k = q.data!;
  const isRefreshing = q.isFetching && !q.isPending;
  const presentPct = k.totalEmployees ? Math.round((k.presentToday / k.totalEmployees) * 100) : 0;
  const absentTotal = k.absent;

  const cards = [
    {
      label: "Total employees",
      value: k.totalEmployees.toLocaleString(),
      valueClass: "text-[#0F1F1B]",
      sub: `▲ +${k.newJoinersThisMonth} this month`,
      subClass: "text-emerald-600",
      extra: null as ReactNode,
    },
    {
      label: "Present today",
      value: String(k.presentToday),
      valueClass: "text-[#10B981]",
      sub: `of ${k.totalEmployees} on roster`,
      subClass: "text-[#7A8784]",
      extra: <Progress value={presentPct} className="mt-3 h-1.5" />,
    },
    {
      label: "Absent",
      value: String(absentTotal),
      valueClass: "text-[#E04F4F]",
      sub: `${k.absentUnplanned} unplanned · ${k.absentOnLeave} on leave`,
      subClass: "text-[#7A8784]",
      extra: null,
    },
    {
      label: "Late arrivals",
      value: String(k.late),
      valueClass: "text-[#F59E0B]",
      sub:
        k.lateDeltaVsYesterday === 0
          ? "Same as yesterday"
          : k.lateDeltaVsYesterday > 0
            ? `▲ +${k.lateDeltaVsYesterday} vs yesterday`
            : `▼ ${Math.abs(k.lateDeltaVsYesterday)} vs yesterday`,
      subClass:
        k.lateDeltaVsYesterday > 0 ? "text-[#E04F4F]" : k.lateDeltaVsYesterday < 0 ? "text-emerald-600" : "text-[#7A8784]",
      extra: null,
    },
    {
      label: "On approved leave",
      value: String(k.onApprovedLeave),
      valueClass: "text-[#0F1F1B]",
      sub: `${k.pendingLeaveRequests} pending requests`,
      subClass: "text-[#7A8784]",
      extra: null,
    },
  ];

  return (
    <div
      className={cn(
        "grid w-full min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5",
        isRefreshing && "opacity-80 transition-opacity",
      )}
    >
      {cards.map((c) => (
        <Card key={c.label} className="min-w-0 w-full">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#7A8784]">{c.label}</p>
          <p className={cn("mt-2 text-3xl font-bold tabular-nums", c.valueClass)}>{c.value}</p>
          <p className={cn("mt-1 text-xs", c.subClass)}>{c.sub}</p>
          {c.extra}
        </Card>
      ))}
    </div>
  );
}

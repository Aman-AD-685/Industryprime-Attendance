"use client";

import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { MeDayBar } from "@/lib/api/me";

const colors: Record<MeDayBar["status"], string> = {
  present: "#10B981",
  late: "#F59E0B",
  off: "#9CA3AF",
  weekend: "#D1D5DB",
};

export function Last7DaysChart({ days, loading }: { days: MeDayBar[] | null; loading: boolean }) {
  if (loading || !days) {
    return <div className="h-64 animate-pulse rounded-2xl bg-zinc-200/80" />;
  }

  const data = days.map((d) => ({
    ...d,
    hoursDisplay: d.hours.toFixed(1),
  }));

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900">Last 7 days</h2>
        <Link href="/dashboard/user/attendance" className="text-xs font-semibold text-emerald-500 hover:underline">
          View all →
        </Link>
      </div>
      <div className="mt-4 h-64 w-full overflow-x-auto snap-x snap-mandatory lg:overflow-visible">
        <div className="h-full min-w-[520px] snap-start lg:min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5EAE8" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7A8784" }} />
              <YAxis tick={{ fontSize: 11, fill: "#7A8784" }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const pl = payload[0].payload as MeDayBar;
                  return (
                    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 shadow">
                      <p className="font-semibold">{pl.label}</p>
                      <p className="text-zinc-500">Total {pl.hours.toFixed(1)}h</p>
                      <p>
                        In {pl.checkIn ?? "—"} · Out {pl.checkOut ?? "—"}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                {data.map((d) => (
                  <Cell
                    key={d.date}
                    fill={colors[d.status]}
                    stroke={d.isToday ? "#0F1F1B" : "none"}
                    strokeWidth={d.isToday ? 2 : 0}
                    strokeDasharray={d.isToday ? "4 2" : undefined}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">Green on-time · amber late · gray off/weekend · dashed outline = today.</p>
    </div>
  );
}

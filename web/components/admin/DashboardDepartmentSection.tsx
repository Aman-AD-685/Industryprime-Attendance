"use client";

import { useMemo } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from "@/components/ui/dashboard-ui";
import { deptChartColor } from "@/lib/admin/deptChartColor";
import { useDepartments } from "@/lib/hooks/useAdminDashboard";

const PIE_H = 224;
export function DashboardDepartmentSection({
  selectedDept,
  onSelectDept,
}: {
  selectedDept: string | null;
  onSelectDept: (d: string | null) => void;
}) {
  const q = useDepartments();
  const chartData = useMemo(
    () =>
      (q.data ?? []).map((d) => ({
        name: d.name,
        value: d.count,
        fill: deptChartColor(d.name),
      })),
    [q.data],
  );
  const total = useMemo(() => chartData.reduce((s, r) => s + r.value, 0), [chartData]);

  if (!q.isLoading && chartData.length === 0) {
    return (
      <Card className="min-w-0 w-full lg:col-span-5">
        <CardHeader>
          <CardTitle>Department breakdown</CardTitle>
          <CardDescription>Present today by team</CardDescription>
        </CardHeader>
        <p className="px-6 pb-6 text-sm text-zinc-500">No attendance marked yet for today, or no employees on roster.</p>
      </Card>
    );
  }

  return (
    <Card className="min-w-0 w-full lg:col-span-5">
      <CardHeader>
        <CardTitle>Department breakdown</CardTitle>
        <CardDescription>Present today by team</CardDescription>
      </CardHeader>

      <div className="hidden lg:block">
        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="relative h-56 w-full min-h-[224px] min-w-[220px] flex-1">
            {q.isLoading ? (
              <Skeleton className="h-full w-full rounded-xl" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height="100%" minHeight={PIE_H}>
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={62}
                      outerRadius={84}
                      paddingAngle={2}
                      onClick={(_, index) => {
                        const name = chartData[index]?.name;
                        if (!name) return;
                        onSelectDept(selectedDept === name ? null : name);
                      }}
                    >
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={entry.fill}
                          opacity={selectedDept && selectedDept !== entry.name ? 0.35 : 1}
                          className="cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-2xl font-bold tabular-nums leading-none text-zinc-900">{total}</p>
                  <p className="mt-1 text-xs font-medium text-zinc-500">Present</p>
                </div>
              </>
            )}
          </div>
          <div className="flex flex-1 flex-col justify-center gap-2 text-sm">
            {chartData.map((row) => (
              <button
                key={row.name}
                type="button"
                onClick={() => onSelectDept(selectedDept === row.name ? null : row.name)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                  selectedDept === row.name
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-zinc-200 bg-zinc-50 hover:border-emerald-500/50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2 font-medium text-zinc-900">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.fill }} aria-hidden />
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-zinc-500">{row.value}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:hidden">
        {q.isLoading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <div className="h-[180px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minHeight={180}>
            <BarChart layout="vertical" data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="name"
                type="category"
                width={100}
                tick={{ fontSize: 11, fill: "#7A8784" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip />
              <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                {chartData.map((e) => (
                  <Cell
                    key={e.name}
                    fill={e.fill}
                    opacity={selectedDept && selectedDept !== e.name ? 0.35 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        )}
        <div className="mt-3 space-y-2">
          {chartData.map((row) => (
            <button
              key={`m-${row.name}`}
              type="button"
              onClick={() => onSelectDept(selectedDept === row.name ? null : row.name)}
              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
                selectedDept === row.name ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 bg-zinc-50"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2 font-medium text-zinc-900">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.fill }} aria-hidden />
                <span className="truncate">{row.name}</span>
              </span>
              <span className="shrink-0 tabular-nums text-zinc-500">{row.value}</span>
            </button>
          ))}
        </div>
      </div>
    </Card>
  );
}

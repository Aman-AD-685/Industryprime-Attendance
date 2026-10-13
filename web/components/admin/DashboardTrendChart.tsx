"use client";

import { format, parseISO } from "date-fns";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  TabsList,
  TabsTrigger,
} from "@/components/ui/dashboard-ui";
import { useTrend } from "@/lib/hooks/useAdminDashboard";

export function DashboardTrendChart({ range, onRange }: { range: "14d" | "30d"; onRange: (r: "14d" | "30d") => void }) {
  const q = useTrend(range);

  const data =
    q.data?.map((row) => ({
      ...row,
      labelShort: (() => {
        try {
          return format(parseISO(row.date), "MMM d");
        } catch {
          return row.date;
        }
      })(),
    })) ?? [];

  return (
    <Card className="min-w-0 w-full lg:col-span-7">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Attendance trend</CardTitle>
            <CardDescription>Last {range === "14d" ? 14 : 30} days · Present vs Absent vs Late</CardDescription>
          </div>
          <TabsList className="shrink-0">
            <TabsTrigger value="14d" current={range} onClick={() => onRange("14d")}>
              Last 14 days
            </TabsTrigger>
            <TabsTrigger value="30d" current={range} onClick={() => onRange("30d")}>
              30 days
            </TabsTrigger>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-900 opacity-70 hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              onClick={() => toast.message("Custom range — coming soon")}
            >
              Custom
            </button>
          </TabsList>
        </div>
      </CardHeader>
      <div className="min-h-[240px] w-full min-w-0">
        {q.isLoading ? (
          <Skeleton className="h-[240px] w-full rounded-xl" />
        ) : (
          <div className="h-[240px] w-full min-w-[200px]">
            <ResponsiveContainer width="100%" height="100%" minHeight={240}>
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEF1F0" />
              <XAxis
                dataKey="labelShort"
                tick={{ fontSize: 10, fill: "#7A8784" }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis tick={{ fontSize: 10, fill: "#7A8784" }} axisLine={false} tickLine={false} />
              <Tooltip />
              <Legend verticalAlign="top" height={28} />
              <Line type="monotone" dataKey="present" name="Present" stroke="#10B981" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="late" name="Late" stroke="#F59E0B" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="absent" name="Absent" stroke="#E04F4F" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

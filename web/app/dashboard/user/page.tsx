"use client";

import { useEffect, useMemo, useState } from "react";

import { KpiStrip } from "@/components/user/KpiStrip";
import { Last7DaysChart } from "@/components/user/Last7DaysChart";
import { RoleGuard, UnauthorizedEmployeeView } from "@/components/user/RoleGuard";
import { TodayCard } from "@/components/user/TodayCard";
import { UpcomingPanel } from "@/components/user/UpcomingPanel";
import { WelcomeBanner } from "@/components/user/WelcomeBanner";
import type { MeToday } from "@/lib/api/me";
import { useSession } from "@/lib/hooks/useSession";
import { getStoredUser } from "@/lib/auth";
import { useMeDashboard } from "@/lib/hooks/useTodayAttendance";

const emptyToday: MeToday = {
  status: "not_started",
  checkInAt: null,
  checkOutAt: null,
  location: null,
  shiftName: "—",
  minutesWorked: 0,
  targetMinutes: 540,
  note: null,
};

export default function UserDashboardPage() {
  const { user } = useSession();
  const role = user?.role ?? getStoredUser()?.role;
  const [reducedMotion, setRm] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setRm(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const [minUi, setMinUi] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setMinUi(true), 600);
    return () => window.clearTimeout(t);
  }, []);

  const { data, isLoading, isError, error, refetch, saveNote } = useMeDashboard();
  const skeleton = !minUi || isLoading;

  const firstName = useMemo(() => (user?.name || "there").split(/\s+/)[0] || "there", [user?.name]);
  const shiftLine = useMemo(() => {
    const parts = [user?.shift, user?.location, user?.joinedAt ? `Joined ${user.joinedAt}` : null].filter(Boolean);
    return parts.length ? parts.join(" · ") : "Shift and location appear here once loaded.";
  }, [user?.joinedAt, user?.location, user?.shift]);

  const today = data?.today ?? emptyToday;
  const lastIso = data?.updatedAt ?? null;

  return (
    <RoleGuard allow={["user"]} role={role} fallback={<UnauthorizedEmployeeView />}>
      <div className="min-h-[calc(100vh-4rem)] bg-[#F7FAF9] pb-32 text-[#0F1F1B] motion-reduce:transition-none lg:pb-12">
        <div className="mx-auto max-w-[1100px] space-y-6">
          {isError ? (
            <div
              className="rounded-2xl border border-[#F59E0B]/40 bg-amber-50 px-4 py-3 text-sm text-amber-950"
              role="alert"
            >
              <span className="font-semibold">Could not refresh your data.</span>{" "}
              {error instanceof Error ? error.message : "Unknown error"}{" "}
              <button type="button" className="font-semibold text-[#10B981] underline" onClick={() => void refetch()}>
                Retry
              </button>
            </div>
          ) : null}

          <WelcomeBanner
            firstName={firstName}
            today={today}
            shiftLine={shiftLine}
            reducedMotion={reducedMotion}
          />

          <div className="grid gap-6 lg:grid-cols-12">
            {skeleton ? (
              <>
                <div className="h-72 animate-pulse rounded-2xl bg-[#E5EAE8]/80 lg:col-span-7" />
                <div className="lg:col-span-5">
                  <KpiStrip kpis={null} loading />
                </div>
                <div className="h-80 animate-pulse rounded-2xl bg-[#E5EAE8]/80 lg:col-span-8" />
                <div className="h-80 animate-pulse rounded-2xl bg-[#E5EAE8]/80 lg:col-span-4" />
              </>
            ) : (
              <>
                <TodayCard
                  today={today}
                  reducedMotion={reducedMotion}
                  onSaveNote={(n) => saveNote.mutateAsync(n)}
                  noteBusy={saveNote.isPending}
                />
                <div className="lg:col-span-5">
                  <KpiStrip kpis={data?.kpis ?? null} loading={false} />
                </div>
                <div className="lg:col-span-8">
                  <Last7DaysChart days={data?.last7Days ?? null} loading={false} />
                </div>
                <div className="lg:col-span-4">
                  <UpcomingPanel holiday={data?.upcoming.nextHoliday ?? null} leave={data?.upcoming.nextLeave ?? null} />
                </div>
              </>
            )}
          </div>

          <div className="mt-8 border-t border-[#E5EAE8] bg-white/90 px-4 py-3 shadow-[0_-1px_0_rgba(0,0,0,0.04)] sm:rounded-xl sm:border sm:shadow-sm">
            <p className="text-center text-sm font-semibold leading-snug text-[#0F1F1B]">
              Last updated{" "}
              <time
                className="font-bold tabular-nums text-[#0F1F1B]"
                dateTime={lastIso ?? undefined}
              >
                {lastIso
                  ? new Date(lastIso).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "—"}
              </time>
              <span className="mt-1 block text-[#374151] sm:mt-0 sm:inline">
                <span className="hidden sm:inline" aria-hidden>
                  {" "}
                  ·{" "}
                </span>
                Auto-refresh every 30s
              </span>
            </p>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

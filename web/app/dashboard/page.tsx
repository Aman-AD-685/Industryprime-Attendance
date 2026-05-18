"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AdminSidebar } from "@/components/admin/Sidebar";
import { DashboardAuditLog } from "@/components/admin/DashboardAuditLog";
import { DashboardDepartmentSection } from "@/components/admin/DashboardDepartmentSection";
import { DashboardLateArrivalsTable } from "@/components/admin/DashboardLateArrivalsTable";
import { DashboardPendingLeaves } from "@/components/admin/DashboardPendingLeaves";
import { DashboardTrendChart } from "@/components/admin/DashboardTrendChart";
import { KpiStrip } from "@/components/admin/KpiStrip";
import { ManagementCards } from "@/components/admin/ManagementCards";
import { PageHeader } from "@/components/admin/PageHeader";
import { useDashboardAdminNav } from "@/components/dashboard/DashboardAdminNavContext";
import { canShowAddAttendanceHeader } from "@/lib/navAccess";
import { can } from "@/lib/permissions";
import { useKpis, usePendingLeaves } from "@/lib/hooks/useAdminDashboard";
import { useSession } from "@/lib/hooks/useSession";
import type { AuthUser } from "@/lib/auth";

const roleLabels: Record<AuthUser["role"], string> = {
  master_admin: "Master Admin",
  admin: "Admin",
  user: "User",
};

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useSession();
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<"14d" | "30d">("14d");
  const dashNav = useDashboardAdminNav();

  const kpisQ = useKpis();
  const pendingQ = usePendingLeaves();

  useEffect(() => {
    if (user?.role === "user") {
      router.replace("/dashboard/user");
    }
  }, [router, user?.role]);

  const showAddAttendanceInCopy = canShowAddAttendanceHeader(user?.email);

  if (!user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[#7A8784]">
        Loading your workspace…
      </div>
    );
  }

  if (user.role === "user") {
    return null;
  }

  const isMaster = user.role === "master_admin";

  return (
    <div className="flex min-h-[calc(100vh-4rem)] w-full min-w-0 overflow-x-hidden bg-[#F7FAF9] pb-36 text-[#0F1F1B] md:pb-28">
      <AdminSidebar
        role={user.role}
        pendingLeaveCount={pendingQ.data?.length ?? 0}
        mobileOpen={dashNav?.adminNavOpen ?? false}
        onMobileOpenChange={(open) => dashNav?.setAdminNavOpen(open)}
      />

      <div className="mx-auto min-w-0 w-full max-w-[1600px] flex-1 space-y-6 px-3 py-4 sm:px-6 lg:px-8 xl:px-10">
        <section className="relative w-full min-w-0 overflow-hidden rounded-2xl border border-[#E5EAE8] bg-white p-4 shadow-sm sm:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.12),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(6,182,212,0.1),transparent_40%)]" />
          <div className="relative flex min-w-0 flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">Secure workspace</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#0F1F1B] dark:text-zinc-50">
                IndustryPrime-Attendance Dashboard
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#7A8784] dark:text-zinc-400">
                Welcome {user?.name || "team member"}. Your role controls which modules and actions are available.
                {showAddAttendanceInCopy ? (
                  <>
                    {" "}
                    Use <span className="font-semibold text-emerald-800 dark:text-emerald-200">Add Attendance</span> in
                    the top bar for <span className="font-medium">Enter Atten.</span> (manual) or{" "}
                    <span className="font-medium">Upload → PDF (daily report)</span>;
                  </>
                ) : (
                  <> Use the menu for Attendance, Leave, or Payroll.</>
                )}
              </p>
            </div>
            <div className="shrink-0 self-start rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200 lg:self-center">
              {roleLabels[user.role]}
            </div>
          </div>
        </section>

        {kpisQ.isError ? (
          <div className="rounded-2xl border border-[#E04F4F]/40 bg-red-50 px-4 py-3 text-sm text-red-900" role="alert">
            <strong className="font-semibold">Could not load KPIs.</strong> {kpisQ.error.message}
            <button type="button" className="ml-2 font-semibold text-[#10B981] underline" onClick={() => void kpisQ.refetch()}>
              Retry
            </button>
          </div>
        ) : null}

        <PageHeader role={user.role} />

        <KpiStrip />

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
          <DashboardTrendChart range={trendRange} onRange={setTrendRange} />
          <DashboardDepartmentSection selectedDept={deptFilter} onSelectDept={setDeptFilter} />
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
          <DashboardLateArrivalsTable deptFilter={deptFilter} onClearDeptFilter={() => setDeptFilter(null)} />
          <DashboardPendingLeaves role={user.role} />
        </div>

        <section className="min-w-0 scroll-mt-6 space-y-3">
          <ManagementCards isMasterAdmin={isMaster} />
        </section>

        {can.seeAuditLog(user.role) ? (
          <section className="min-w-0 scroll-mt-6">
            <DashboardAuditLog />
          </section>
        ) : null}
      </div>
    </div>
  );
}

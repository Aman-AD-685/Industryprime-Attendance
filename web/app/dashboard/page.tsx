"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredUser, type AuthUser } from "@/lib/auth";

type Kpis = {
  total_employees: number;
  present_today: number;
  absent: number;
  late: number;
};

const roleLabels: Record<AuthUser["role"], string> = {
  master_admin: "Master Admin",
  admin: "Admin",
  user: "User",
};

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());
  const [kpis, setKpis] = useState<Kpis>({
    total_employees: 0,
    present_today: 0,
    absent: 0,
    late: 0,
  });

  useEffect(() => {
    const onAuthChange = () => setUser(getStoredUser());
    window.addEventListener("industryprime-auth-change", onAuthChange);
    let cancelled = false;
    (async () => {
      try {
        const json = await apiFetch<Kpis>("/dashboard/summary");
        if (!cancelled) setKpis(json);
      } catch {
        if (!cancelled) {
          setKpis({
            total_employees: 0,
            present_today: 0,
            absent: 0,
            late: 0,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("industryprime-auth-change", onAuthChange);
    };
  }, []);

  const modules = [
    {
      title: "Attendance",
      description: user?.role === "user" ? "View your attendance summary." : "Upload and review attendance reports.",
      access: "All roles",
    },
    {
      title: "Employee Management",
      description: "Manage employee records and directory data.",
      access: user?.role === "user" ? "Restricted" : "Admin and Master Admin",
    },
    {
      title: "User & Role Control",
      description: "Manage users and role assignments.",
      access: user?.role === "master_admin" ? "Available" : "Master Admin only",
    },
  ];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/75 p-6 shadow-sm backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.22),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(6,182,212,0.18),transparent_40%)]" />
        <div className="relative flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              Secure workspace
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              IndustryPrime-Attendance Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Welcome {user?.name || "team member"}. Your role controls which modules and actions are available.
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
            {user ? roleLabels[user.role] : "Verified user"}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Total Employees", kpis.total_employees.toLocaleString()],
          ["Present Today", kpis.present_today.toLocaleString()],
          ["Absent", kpis.absent.toLocaleString()],
          ["Late", kpis.late.toLocaleString()],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-3xl border border-zinc-200/70 bg-white/75 p-5 shadow-sm backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/40"
          >
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {modules.map((module) => (
          <div
            key={module.title}
            className="rounded-3xl border border-zinc-200/70 bg-white/75 p-5 shadow-sm backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/40"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {module.title}
              </h2>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                {module.access}
              </span>
            </div>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{module.description}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

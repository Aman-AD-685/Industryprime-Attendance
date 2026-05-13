"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { getStoredUser, type Role } from "@/lib/auth";
import {
  IconBarChart,
  IconCalendarCheck,
  IconClipboardList,
  IconChevronLeft,
  IconChevronRight,
  IconGrid,
  IconSettings,
  IconSparkles,
  IconUsers,
  IconWallet,
} from "./icons";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapse: () => void;
};

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  roles?: Role[];
};

export default function Sidebar({
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const pathname = usePathname();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const syncRole = () => setRole(getStoredUser()?.role ?? null);
    syncRole();
    window.addEventListener("industryprime-auth-change", syncRole);
    return () => window.removeEventListener("industryprime-auth-change", syncRole);
  }, []);

  const items: NavItem[] = useMemo(
    () => [
      { label: "Dashboard", href: "/dashboard", icon: IconGrid },
      {
        label: "Users",
        href: "/users",
        icon: IconUsers,
        roles: ["master_admin"],
      },
      {
        label: "Leave oversight",
        href: "/leave/admin",
        icon: IconClipboardList,
        roles: ["master_admin"],
      },
      { label: "Employees", href: "/employees", icon: IconUsers },
      {
        label: "Attendance",
        href: "/attendance",
        icon: IconCalendarCheck,
      },
      { label: "Leave", href: "/leave", icon: IconClipboardList },
      { label: "Payroll", href: "/payroll", icon: IconWallet },
      { label: "Reports", href: "/reports", icon: IconBarChart },
      { label: "Settings", href: "/settings", icon: IconSettings, roles: ["master_admin"] },
    ],
    []
  );

  const visibleItems = useMemo(() => {
    const base = items.filter((item) => !item.roles || (role && item.roles.includes(role)));
    if (role === "user") {
      // User role: show user-scoped work areas only.
      return base.filter(
        (item) =>
          item.href === "/dashboard" ||
          item.href === "/attendance" ||
          item.href === "/leave" ||
          item.href === "/payroll",
      );
    }
    return base;
  }, [items, role]);

  return (
    <aside
      className={cn(
        // Use 100dvh instead of 100vh to avoid mobile/desktop viewport UI cutoffs.
        "hidden h-[100dvh] shrink-0 flex-col md:flex md:sticky md:top-0",
        "transition-[width] duration-300 ease-out",
        collapsed ? "w-[84px]" : "w-72"
      )}
    >
      <div className="flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white shadow ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
            <Image
              src="/industryprime-logo.png"
              alt="Industryprime logo"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </span>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                Industryprime
              </div>
              <div className="text-xs text-zinc-500 dark:text-zinc-400">
                Attendance
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          className="hidden h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white/70 text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200 md:inline-flex"
          onClick={onToggleCollapse}
          aria-label="Collapse sidebar"
        >
          {collapsed ? (
            <IconChevronRight className="h-5 w-5" />
          ) : (
            <IconChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {visibleItems.map((item) => {
          /* Keep "Attendance" like before: only the employee list + /attendance/:id sheets—not PDF/upload tools under the same prefix. */
          const isAttendanceSheet =
            pathname === "/attendance" ||
            (pathname.startsWith("/attendance/") && !pathname.startsWith("/attendance/upload"));
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : item.href === "/attendance"
                ? isAttendanceSheet
                : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition",
                active
                  ? "bg-emerald-600 text-white shadow"
                  : "text-zinc-700 hover:bg-white/70 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-5 w-5 flex-none",
                  active ? "text-white" : "text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-400"
                )}
              />

              <span
                className={cn(
                  "truncate text-sm font-semibold transition-opacity",
                  collapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"
                )}
              >
                {item.label}
              </span>

              {!collapsed && active && (
                <span
                  className="absolute left-0 top-2 h-8 w-1 rounded-tr-lg rounded-br-lg bg-white/30"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </div>

      <div className="px-2 pb-2">
        {!collapsed ? (
          <div className="rounded-2xl border border-zinc-200 bg-white/60 p-3 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              Premium mode
            </div>
            <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Smart attendance insights
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-200 bg-white/60 p-3 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/40">
            <IconSparkles className="h-5 w-5 text-emerald-600" />
          </div>
        )}
      </div>
    </aside>
  );
}


"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { useDashboardAdminNav } from "@/components/dashboard/DashboardAdminNavContext";
import AddAttendanceHeaderLink from "./AddAttendanceHeaderLink";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";
import { getStoredUser } from "@/lib/auth";
import { canShowAddAttendanceHeader } from "@/lib/navAccess";
import { DRAWER_ID } from "./Sidebar";
import { IconMenu, IconSearch } from "./icons";

type HeaderProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export default function Header({ isSidebarOpen, onToggleSidebar }: HeaderProps) {
  const pathname = usePathname();
  const dashNav = useDashboardAdminNav();
  const [email, setEmail] = useState<string | null>(() => getStoredUser()?.email ?? null);
  const [dashRole, setDashRole] = useState<"admin" | "master_admin" | null>(() => {
    const r = getStoredUser()?.role;
    return r === "admin" || r === "master_admin" ? r : null;
  });

  useEffect(() => {
    const sync = () => {
      setEmail(getStoredUser()?.email ?? null);
      const r = getStoredUser()?.role;
      setDashRole(r === "admin" || r === "master_admin" ? r : null);
    };
    sync();
    window.addEventListener("industryprime-auth-change", sync);
    return () => window.removeEventListener("industryprime-auth-change", sync);
  }, []);

  const showAddAttendance = canShowAddAttendanceHeader(email);
  const showDashActions = pathname === "/dashboard" && dashRole;
  const mergedAdminMenu = Boolean(dashNav?.isStaffDashboard && dashRole);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200/60 bg-white/85 backdrop-blur-md dark:border-zinc-800/60 dark:bg-zinc-950/90">
      {/* Full-width bar; padding matches main content. md+: grid pins left / right clusters to column edges. */}
      <div className="mx-auto grid w-full min-w-0 grid-cols-1 gap-y-2 px-3 py-3 sm:px-6 md:h-16 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-4 md:gap-y-0 md:py-0 lg:px-8">
        <div className="flex min-w-0 w-full items-center gap-x-2 sm:gap-x-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white/80 text-zinc-800 shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-100"
            onClick={() => {
              if (mergedAdminMenu && dashNav) {
                dashNav.toggleAdminNav();
              } else {
                onToggleSidebar();
              }
            }}
            aria-expanded={mergedAdminMenu && dashNav ? dashNav.adminNavOpen : isSidebarOpen}
            aria-controls={mergedAdminMenu ? "admin-dashboard-nav-sheet" : DRAWER_ID}
            aria-label={
              mergedAdminMenu && dashNav
                ? dashNav.adminNavOpen
                  ? "Close dashboard menu"
                  : "Open dashboard menu"
                : isSidebarOpen
                  ? "Close navigation menu"
                  : "Open navigation menu"
            }
          >
            <IconMenu className="h-5 w-5" />
          </button>

          <div className="relative min-w-0 flex-1">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              placeholder="Search employees, attendance, reports..."
              className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white/70 py-2 pl-10 pr-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              aria-label="Search employees, attendance, and reports"
            />
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-end gap-x-2 sm:gap-x-3 md:w-auto md:flex-nowrap md:justify-self-end md:gap-x-4 md:pl-4 lg:pl-8">
          {(showDashActions && dashRole) || showAddAttendance ? (
            <div className="flex flex-wrap items-center justify-end gap-2 md:ml-2 lg:ml-4">
              <AddAttendanceHeaderLink variant={showDashActions && dashRole ? "solid" : "default"} />
            </div>
          ) : null}
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

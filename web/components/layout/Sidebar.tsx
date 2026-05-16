"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { getStoredUser, type Role } from "@/lib/auth";
import {
  IconBarChart,
  IconCalendarCheck,
  IconClipboardList,
  IconGrid,
  IconSettings,
  IconSparkles,
  IconUsers,
  IconWallet,
  IconX,
} from "./icons";

export const DRAWER_ID = "main-nav-drawer";
const DRAWER_TITLE_ID = "main-nav-drawer-title";

export type SidebarProps = {
  isOpen: boolean;
  /** Close after route change (does not update desktop persistence). */
  onClose: () => void;
  /** User explicitly dismissed the drawer (backdrop, close control); updates optional persistence. */
  onDismiss: () => void;
};

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  roles?: Role[];
};

export default function Sidebar({ isOpen, onClose, onDismiss }: SidebarProps) {
  const pathname = usePathname();
  const [role, setRole] = useState<Role | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

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
      return base.filter(
        (item) =>
          item.href === "/dashboard" ||
          item.href === "/attendance" ||
          item.href === "/leave" ||
          item.href === "/payroll",
      );
    }
    /* admin: all sections except Leave oversight (master_admin only in items). master_admin: full base. */
    if (role === "admin") {
      return base.filter((item) => item.href !== "/leave/admin");
    }
    return base;
  }, [items, role]);

  const navItems = useMemo(() => {
    return visibleItems.map((it) =>
      it.href === "/dashboard" && role === "user" ? { ...it, href: "/dashboard/user", label: "My dashboard" } : it,
    );
  }, [visibleItems, role]);

  function linkIsNoOp(href: string): boolean {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/dashboard/user") return pathname === "/dashboard/user" || pathname.startsWith("/dashboard/user/");
    if (href === "/attendance") {
      return (
        pathname === "/attendance" ||
        (pathname.startsWith("/attendance/") && !pathname.startsWith("/attendance/upload"))
      );
    }
    return pathname === href;
  }

  useEffect(() => {
    if (!isOpen) return;
    const root = asideRef.current;
    if (!root) return;

    closeBtnRef.current?.focus({ preventScroll: true });

    const trapRoot = root;
    const selector = 'a[href], button:not([disabled])';
    function listFocusables(): HTMLElement[] {
      return Array.from(trapRoot.querySelectorAll<HTMLElement>(selector));
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const list = listFocusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    trapRoot.addEventListener("keydown", onKeyDown);
    return () => trapRoot.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <aside
      ref={asideRef}
      id={DRAWER_ID}
      role="dialog"
      aria-modal="true"
      aria-labelledby={DRAWER_TITLE_ID}
      aria-hidden={!isOpen}
      inert={!isOpen ? true : undefined}
      className={cn(
        "flex h-[100dvh] w-[min(18rem,92vw)] max-w-[20rem] flex-col border-r border-zinc-200/80 bg-[var(--background)] shadow-2xl dark:border-zinc-800/80",
        "fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-out motion-reduce:transition-none",
        isOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
      )}
    >
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-zinc-200/60 px-4 dark:border-zinc-800/60">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white shadow ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
            <Image
              src="/industryprime-logo.png"
              alt="Industryprime"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </span>
          <div id={DRAWER_TITLE_ID} className="min-w-0 leading-tight">
            <div className="truncate text-sm font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              Industryprime
            </div>
            <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">Attendance</div>
          </div>
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-zinc-200 bg-white/80 text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200"
          onClick={onDismiss}
          aria-label="Close navigation menu"
        >
          <IconX className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-2 pb-2" aria-label="Main pages">
        {navItems.map((item) => {
          const isAttendanceSheet =
            pathname === "/attendance" ||
            (pathname.startsWith("/attendance/") && !pathname.startsWith("/attendance/upload"));
          const active =
            item.href === "/dashboard/user"
              ? pathname.startsWith("/dashboard/user")
              : item.href === "/dashboard"
                ? pathname === "/dashboard"
                : item.href === "/attendance"
                  ? isAttendanceSheet
                  : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={(e) => {
                if (linkIsNoOp(item.href)) {
                  e.preventDefault();
                }
                onClose();
              }}
              className={cn(
                "group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 transition",
                active
                  ? "bg-emerald-600 text-white shadow"
                  : "text-zinc-700 hover:bg-white/70 dark:text-zinc-200 dark:hover:bg-zinc-900/60",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-5 w-5 flex-none",
                  active ? "text-white" : "text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-400",
                )}
              />

              <span className="truncate text-sm font-semibold">{item.label}</span>

              {active && (
                <span
                  className="absolute left-0 top-2 h-8 w-1 rounded-tr-lg rounded-br-lg bg-white/30"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="shrink-0 px-2 pb-3">
        <div className="rounded-2xl border border-zinc-200 bg-white/60 p-3 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/40">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">Premium mode</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Smart attendance insights
          </div>
          <IconSparkles className="mt-2 h-5 w-5 text-emerald-600" aria-hidden />
        </div>
      </div>
    </aside>
  );
}

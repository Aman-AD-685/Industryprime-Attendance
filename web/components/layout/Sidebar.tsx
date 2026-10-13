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
  const [canApproveLeave, setCanApproveLeave] = useState(false);
  const asideRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const syncRole = () => {
      const u = getStoredUser();
      setRole(u?.role ?? null);
      setCanApproveLeave(Boolean(u?.can_approve_leave));
    };
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
      const userItems = base.filter(
        (item) =>
          item.href === "/dashboard" ||
          item.href === "/attendance" ||
          item.href === "/leave" ||
          item.href === "/payroll",
      );
      if (canApproveLeave) {
        return [{ label: "Approve leave", href: "/leave/approvals", icon: IconClipboardList }, ...userItems];
      }
      return userItems;
    }
    /* admin: all sections except Leave oversight (master_admin only in items). master_admin: full base. */
    if (role === "admin") {
      return base.filter((item) => item.href !== "/leave/admin");
    }
    return base;
  }, [items, role, canApproveLeave]);

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
        "flex h-[100dvh] w-[min(15rem,88vw)] max-w-[16rem] flex-col border-r border-white/5 bg-zinc-950 text-zinc-200 shadow-2xl",
        "bg-[radial-gradient(40rem_20rem_at_-20%_-10%,rgb(20_163_111/0.28),transparent_60%)]",
        "fixed inset-y-0 left-0 z-[60] transition-transform duration-300 ease-out motion-reduce:transition-none",
        isOpen ? "translate-x-0" : "-translate-x-full pointer-events-none",
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-white/20">
            <Image
              src="/industryprime-logo.png"
              alt="Industryprime"
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </span>
          <div id={DRAWER_TITLE_ID} className="min-w-0 leading-tight">
            <div className="truncate text-sm font-extrabold tracking-tight text-white">Industryprime</div>
            <div className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-300/90">
              Attendance
            </div>
          </div>
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-300 transition hover:bg-white/10 hover:text-white"
          onClick={onDismiss}
          aria-label="Close navigation menu"
        >
          <IconX className="h-5 w-5" />
        </button>
      </div>

      <div className="px-5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Menu</div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 py-1 pb-2" aria-label="Main pages">
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
                "group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition",
                active
                  ? "bg-emerald-500/15 text-white ring-1 ring-emerald-400/25"
                  : "text-zinc-400 hover:bg-white/[0.06] hover:text-white",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={cn(
                  "h-5 w-5 flex-none transition",
                  active ? "text-emerald-300" : "text-zinc-500 group-hover:text-emerald-300",
                )}
              />

              <span className="truncate text-sm font-semibold">{item.label}</span>

              {active && (
                <span
                  className="absolute left-0 top-2.5 h-6 w-1 rounded-r-full bg-emerald-400 shadow-[0_0_12px_rgb(57_189_138/0.8)]"
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}

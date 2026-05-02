"use client";

import AddAttendanceHeaderLink from "./AddAttendanceHeaderLink";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import UserMenu from "./UserMenu";
import { IconChevronLeft, IconSearch } from "./icons";

export default function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  return (
    <div className="sticky top-0 z-40 -mx-4 border-b border-zinc-200/60 bg-white/60 px-4 backdrop-blur dark:border-zinc-800/60 dark:bg-zinc-950/40">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between">
        <button
          type="button"
          className="mr-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white/70 text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200 sm:hidden"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <IconChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="relative w-full max-w-[520px]">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search employees, attendance, reports..."
              className="w-full rounded-2xl border border-zinc-200 bg-white/70 py-2 pl-10 pr-3 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <AddAttendanceHeaderLink />
          <NotificationBell />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </div>
  );
}


"use client";

import { useEffect, useRef, useState } from "react";
import { clearAuth, getStoredUser, navigateAfterAuth, type AuthUser } from "@/lib/auth";
import { IconLogOut } from "./icons";

export default function UserMenu() {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setUser(getStoredUser());
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onAuthChange() {
      setUser(getStoredUser());
    }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("industryprime-auth-change", onAuthChange);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("industryprime-auth-change", onAuthChange);
    };
  }, []);

  function handleSignOut() {
    setOpen(false);
    clearAuth();
    navigateAfterAuth("/login");
  }

  const displayName = user?.name || "User";
  const displayEmail = user?.email || "user@industryprime.com";
  const role = user?.role?.replace("_", " ") || "user";
  const avatar = displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60"
        aria-label="User menu"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-sm font-semibold text-white">
          {avatar}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {displayName}
          </span>
          <span className="block text-xs capitalize text-zinc-500 dark:text-zinc-400">
            {role}
          </span>
        </span>
      </button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white/85 shadow-lg backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/70"
          role="menu"
          aria-label="User menu items"
        >
          <div className="px-4 py-3">
            <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {displayName}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {displayEmail}
            </div>
          </div>

          <div className="border-t border-zinc-200/60 px-2 py-2 dark:border-zinc-800/60">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-900"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Profile
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-700 transition hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-900/30"
              role="menuitem"
              onClick={handleSignOut}
            >
              <IconLogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

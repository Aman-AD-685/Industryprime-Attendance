"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { cn } from "@/lib/cn";
import { clearAuth, getCurrentUser, getStoredToken, type AuthUser } from "@/lib/auth";

const publicRoutes = new Set(["/login", "/signup", "/attendance-entry", "/attendance-upload"]);
const redirectAuthedPublicRoutes = new Set(["/login", "/signup"]);

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const isPublicRoute = useMemo(() => publicRoutes.has(pathname), [pathname]);
  const redirectIfAuthedPublic = useMemo(
    () => redirectAuthedPublicRoutes.has(pathname),
    [pathname],
  );

  useEffect(() => {
    let mounted = true;

    async function verifySession() {
      setLoadingSession(true);
      try {
        if (!getStoredToken()) {
          if (mounted) setUser(null);
          return;
        }
        const currentUser = await getCurrentUser();
        if (mounted) setUser(currentUser);
      } catch {
        clearAuth();
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoadingSession(false);
      }
    }

    void verifySession();
    window.addEventListener("industryprime-auth-change", verifySession);
    return () => {
      mounted = false;
      window.removeEventListener("industryprime-auth-change", verifySession);
    };
    // Refresh and login/logout handled here. Do not re-run on pathname — parallel /auth/me calls caused flaky “stuck” loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: stable session probe
  }, []);

  useEffect(() => {
    if (loadingSession) return;
    if (!user && !isPublicRoute) {
      router.replace("/login");
      return;
    }
    if (user && redirectIfAuthedPublic) {
      router.replace("/dashboard");
    }
  }, [isPublicRoute, loadingSession, pathname, redirectIfAuthedPublic, router, user]);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  if (loadingSession || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white/60 dark:bg-zinc-950/40">
        <div className="h-9 w-44 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      <div className={cn("flex min-w-0 flex-1 flex-col")}>
        <Header onToggleSidebar={() => setCollapsed((v) => !v)} />
        <main
          className="mx-auto w-full flex-1 px-4 py-8 sm:px-6 lg:px-8"
          aria-label="Page content"
        >
          {children}
        </main>
      </div>
    </div>
  );
}


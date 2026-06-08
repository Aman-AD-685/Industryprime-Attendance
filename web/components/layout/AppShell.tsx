"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { InstallAppPrompt } from "@/components/pwa/InstallAppPrompt";
import { DashboardAdminNavProvider } from "@/components/dashboard/DashboardAdminNavContext";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { cn } from "@/lib/cn";
import {
  clearAuth,
  dashboardPathForRole,
  getStoredToken,
  getStoredUser,
  hasServerSessionCookie,
  isSessionFresh,
  navigateAfterAuth,
  reconcileClientSession,
  revalidateSessionUser,
  syncSessionCookiesFromStorage,
  type AuthUser,
} from "@/lib/auth";
import { isLeaveEmailPublicPath } from "@/lib/leaveEmailPublicPaths";

const publicRoutes = new Set(["/login", "/signup", "/attendance-entry", "/attendance-upload"]);
const redirectAuthedPublicRoutes = new Set(["/login", "/signup"]);

const LS_SIDEBAR_OPEN = "industryprime.sidebarOpen";

function isDesktopMq(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 768px)").matches;
}

function readPersistedSidebarOpen(): boolean {
  try {
    if (typeof window !== "undefined" && isDesktopMq()) {
      return window.localStorage.getItem(LS_SIDEBAR_OPEN) === "true";
    }
  } catch {
    /* private mode / quota */
  }
  return false;
}

function writePersistedSidebarOpen(open: boolean) {
  try {
    if (typeof window !== "undefined" && isDesktopMq()) {
      window.localStorage.setItem(LS_SIDEBAR_OPEN, open ? "true" : "false");
    }
  } catch {
    /* ignore */
  }
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  /** Start null on server and client so first paint matches (avoids hydration mismatch). */
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const prevPathRef = useRef<string | null>(null);
  const authRedirectRef = useRef(false);

  useLayoutEffect(() => {
    reconcileClientSession();
  }, []);

  const isPublicRoute = useMemo(
    () => publicRoutes.has(pathname) || pathname.startsWith("/signup/verify") || isLeaveEmailPublicPath(pathname),
    [pathname],
  );
  const isLeaveEmailRoute = useMemo(() => isLeaveEmailPublicPath(pathname), [pathname]);
  const redirectIfAuthedPublic = useMemo(
    () => redirectAuthedPublicRoutes.has(pathname),
    [pathname],
  );

  useEffect(() => {
    if (!redirectIfAuthedPublic) {
      authRedirectRef.current = false;
    }
  }, [redirectIfAuthedPublic]);

  /** Hydrate session from storage before paint (server and client both start with user=null). */
  useLayoutEffect(() => {
    const token = getStoredToken();
    const cached = getStoredUser();
    if (!token) {
      setUser(null);
      setLoadingSession(false);
      return;
    }
    if (cached) {
      setUser(cached);
      setLoadingSession(false);
      return;
    }
    if (isPublicRoute) {
      setLoadingSession(false);
      return;
    }
    setLoadingSession(true);
  }, [isPublicRoute, pathname]);

  /** Login/signup: verifySession is skipped on public routes — still react to storeAuth(). */
  useEffect(() => {
    if (!redirectIfAuthedPublic) return;
    const onAuthChange = () => {
      const token = getStoredToken();
      const cached = getStoredUser();
      if (token && cached) {
        setUser(cached);
        setLoadingSession(false);
      } else if (!token) {
        setUser(null);
        setLoadingSession(false);
      }
    };
    window.addEventListener("industryprime-auth-change", onAuthChange);
    return () => window.removeEventListener("industryprime-auth-change", onAuthChange);
  }, [redirectIfAuthedPublic]);

  useEffect(() => {
    if (!isPublicRoute) {
      const failSafe = window.setTimeout(() => {
        setLoadingSession(false);
      }, 12_000);
      return () => window.clearTimeout(failSafe);
    }
  }, [isPublicRoute, pathname]);

  useEffect(() => {
    if (isPublicRoute) {
      return;
    }

    let mounted = true;

    async function verifySession() {
      const token = getStoredToken();
      if (!token) {
        if (mounted) {
          setUser(null);
          setLoadingSession(false);
        }
        return;
      }

      const cached = getStoredUser();
      if (cached && mounted) {
        setUser(cached);
        setLoadingSession(false);
      } else if (mounted) {
        setLoadingSession(true);
      }

      const fresh = await revalidateSessionUser();
      if (!mounted) return;
      if (fresh) {
        setUser(fresh);
      } else if (!cached) {
        clearAuth();
        setUser(null);
      }
      setLoadingSession(false);
    }

    void verifySession();
    const onAuthChange = () => {
      const token = getStoredToken();
      const cached = getStoredUser();
      if (token && cached) {
        setUser(cached);
        setLoadingSession(false);
        if (isSessionFresh()) return;
      } else if (!token) {
        setUser(null);
        setLoadingSession(false);
      }
      void verifySession();
    };
    window.addEventListener("industryprime-auth-change", onAuthChange);
    return () => {
      mounted = false;
      window.removeEventListener("industryprime-auth-change", onAuthChange);
    };
  }, [isPublicRoute]);

  useEffect(() => {
    if (loadingSession) return;
    if (!user && !isPublicRoute) {
      const token = getStoredToken();
      const cached = getStoredUser();
      if (token && cached) {
        setUser(cached);
        setLoadingSession(false);
        return;
      }
      if (token) {
        setLoadingSession(true);
        void revalidateSessionUser().then((fresh) => {
          if (fresh) setUser(fresh);
          else clearAuth();
          setLoadingSession(false);
        });
        return;
      }
      if (hasServerSessionCookie()) {
        syncSessionCookiesFromStorage();
      }
      if (!getStoredToken()) {
        navigateAfterAuth("/login", { force: true });
      }
      return;
    }
    if (user && redirectIfAuthedPublic && !authRedirectRef.current) {
      authRedirectRef.current = true;
      syncSessionCookiesFromStorage();
      navigateAfterAuth(dashboardPathForRole(user.role), { force: true });
    }
  }, [isPublicRoute, loadingSession, pathname, redirectIfAuthedPublic, user]);

  /** Close after route change; does not change localStorage preference. */
  const closeSidebarFromNav = useCallback(() => setIsSidebarOpen(false), []);

  /** User toggled menu (hamburger) — persist preference on desktop. */
  const toggleSidebarFromUser = useCallback(() => {
    setIsSidebarOpen((v) => {
      const next = !v;
      writePersistedSidebarOpen(next);
      return next;
    });
  }, []);

  const openMainSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const closeMainSidebar = useCallback(() => setIsSidebarOpen(false), []);

  /** User dismissed drawer (backdrop, X) — persist closed on desktop. */
  const dismissSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    writePersistedSidebarOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (!readPersistedSidebarOpen()) return;
    setIsSidebarOpen(true);
  }, []);

  useEffect(() => {
    if (prevPathRef.current === null) {
      prevPathRef.current = pathname;
      return;
    }
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      setIsSidebarOpen(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = isSidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!isSidebarOpen) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissSidebar();
      }
    }
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [isSidebarOpen, dismissSidebar]);

  if (isPublicRoute) {
    return (
      <>
        {!isLeaveEmailRoute ? <InstallAppPrompt /> : null}
        {children}
      </>
    );
  }

  if (loadingSession || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white/60 dark:bg-zinc-950/40">
        <div className="h-9 w-44 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      </div>
    );
  }

  return (
    <DashboardAdminNavProvider
      pathname={pathname}
      onOpenMainSidebar={openMainSidebar}
      onCloseMainSidebar={closeMainSidebar}
    >
      <div className="flex min-h-screen w-full flex-col bg-[var(--background)] text-[var(--foreground)]">
        {isSidebarOpen ? (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-zinc-950/55 backdrop-blur-[2px] motion-reduce:backdrop-blur-none"
            aria-label="Close navigation overlay"
            onClick={dismissSidebar}
          />
        ) : null}

        <Sidebar isOpen={isSidebarOpen} onClose={closeSidebarFromNav} onDismiss={dismissSidebar} />

        <Header isSidebarOpen={isSidebarOpen} onToggleSidebar={toggleSidebarFromUser} />

        <main
          className={cn("relative z-10 mx-auto w-full flex-1 px-3 py-6 sm:px-6 sm:py-8 lg:px-8")}
          aria-label="Page content"
        >
          {children}
        </main>

        <InstallAppPrompt />
      </div>
    </DashboardAdminNavProvider>
  );
}

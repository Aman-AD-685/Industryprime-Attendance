"use client";

import { directBrowserApiBase } from "@/lib/envApi";
import { userFacingApiDetail } from "@/lib/userFacingError";

export type Role = "master_admin" | "admin" | "user";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  created_at?: string;
};

type AuthResponse = {
  access_token: string;
  refresh_token?: string;
  token_type: "bearer";
  user: AuthUser;
};

type SignupStartResponse = {
  otp_sent: boolean;
  email: string;
  /** Present when Supabase OTP tables are not migrated; pass to verify/resend. */
  signup_ticket?: string;
};

export const TOKEN_KEY = "industryprime.authToken";
export const REFRESH_TOKEN_KEY = "industryprime.refreshToken";
export const USER_KEY = "industryprime.authUser";
export const COOKIE_NAME = "industryprime_token";
/** Lightweight presence flag for `proxy.ts` when JWT cookie is too large or blocked. */
export const SESSION_COOKIE = "industryprime_session";
export const SESSION_TIMESTAMP_KEY = "industryprime.sessionTimestamp";
/** @deprecated Legacy key — cleared on logout for migration */
const SESSION_CHECKED_AT_KEY = "industryprime.sessionCheckedAt";
const LEGACY_LS_KEYS = [TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, SESSION_TIMESTAMP_KEY, SESSION_CHECKED_AT_KEY];

/** FMS-style: session ends when all tabs close (sessionStorage, not localStorage). */
function authStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function readAuthItem(key: string): string | null {
  const store = authStorage();
  if (!store) return null;
  try {
    const fromSession = store.getItem(key);
    if (fromSession?.trim()) return fromSession;
    const legacy = window.localStorage.getItem(key);
    if (legacy?.trim()) {
      store.setItem(key, legacy);
      window.localStorage.removeItem(key);
      return legacy;
    }
  } catch {
    /* private mode / quota */
  }
  return null;
}

function writeAuthItem(key: string, value: string): void {
  const store = authStorage();
  if (!store) return;
  try {
    store.setItem(key, value);
  } catch {
    /* sessionStorage blocked — cookies used for proxy gate */
  }
}

function removeAuthItem(key: string): void {
  try {
    authStorage()?.removeItem(key);
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Abort hung API calls so refresh never spins forever (esp. offline / wrong NEXT_PUBLIC_API_URL). */
const AUTH_FETCH_TIMEOUT_MS = 18_000;
/** Login/signup — FMS uses 180s for cold Render / Supabase latency. */
const AUTH_LOGIN_TIMEOUT_MS = 180_000;
/** Proactive token refresh interval (FMS: 50 minutes). */
export const SESSION_REFRESH_INTERVAL_MS = 50 * 60 * 1000;
/** Session probe — fail fast so shell can render from cache quickly. */
const SESSION_FETCH_TIMEOUT_MS = 8_000;
/** Skip /auth/me when cache was validated recently (ms). */
const SESSION_TTL_MS = 5 * 60 * 1000;

function readCookieRaw(name: string): string | null {
  if (typeof document === "undefined") return null;
  const safe = name.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const m = document.cookie.match(new RegExp(`(?:^|; )${safe}=([^;]*)`));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].trim());
  } catch {
    return m[1].trim();
  }
}

function setCookie(name: string, value: string, maxAgeSeconds: number) {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`;
}

function clearCookie(name: string) {
  const secure =
    typeof window !== "undefined" && window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax${secure}`;
}

export function hasServerSessionCookie(): boolean {
  return Boolean(readCookieRaw(COOKIE_NAME) || readCookieRaw(SESSION_COOKIE));
}

function authFetchTimeoutMs(path: string): number {
  if (path === "/auth/me") return SESSION_FETCH_TIMEOUT_MS;
  if (path.startsWith("/auth/")) return AUTH_LOGIN_TIMEOUT_MS;
  return AUTH_FETCH_TIMEOUT_MS;
}

export function isSessionFresh(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw =
      readAuthItem(SESSION_TIMESTAMP_KEY) ?? readAuthItem(SESSION_CHECKED_AT_KEY);
    if (!raw) return false;
    const t = Number(raw);
    return Number.isFinite(t) && Date.now() - t < SESSION_TTL_MS;
  } catch {
    return false;
  }
}

export function markSessionFresh(): void {
  if (typeof window === "undefined") return;
  writeAuthItem(SESSION_TIMESTAMP_KEY, String(Date.now()));
}

function isRetryableAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("cannot reach") ||
    msg.includes("bad gateway") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const base = directBrowserApiBase().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  let res: Response;
  const controller = new AbortController();
  const timeoutMs = authFetchTimeoutMs(p);
  const timeoutId =
    typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), timeoutMs)
      : 0;

  try {
    res = await fetch(`${base}${p}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch (cause: unknown) {
    const aborted =
      (cause instanceof DOMException && cause.name === "AbortError") ||
      (typeof cause === "object" &&
        cause !== null &&
        (cause as { name?: string }).name === "AbortError");
    throw new Error(
      userFacingApiDetail(
        aborted
          ? `Auth request timed out after ${timeoutMs / 1000}s (base ${base}). Is FastAPI running?`
          : `Cannot reach FastAPI (base ${base}). Check NEXT_PUBLIC_API_URL / API proxy, backend status, and CORS.`,
      ),
    );
  } finally {
    if (timeoutId && typeof window !== "undefined") window.clearTimeout(timeoutId);
  }

  const rawText = await res.text();
  const trimmed = rawText.trim();
  let body: unknown;
  if (!trimmed) {
    body = null;
  } else {
    try {
      body = JSON.parse(trimmed) as unknown;
    } catch {
      body = undefined;
    }
  }

  if (!res.ok) {
    const rec = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
    const detail = rec?.detail;
    let msg: string;
    if (typeof detail === "string") {
      msg = detail;
    } else if (Array.isArray(detail)) {
      msg = detail.map((x: { msg?: string }) => x?.msg || JSON.stringify(x)).join("; ");
    } else if (rec?.message) {
      msg = String(rec.message);
    } else if (res.status === 429) {
      msg =
        typeof detail === "string" && detail
          ? detail
          : "Too many attempts. Please wait a minute and try again.";
    } else if (res.status === 502 || res.status === 503 || res.status === 504) {
      msg =
        "Cannot reach the API server (bad gateway). On Vercel, set BACKEND_PROXY_TARGET or NEXT_PUBLIC_API_URL to your live FastAPI base URL, then redeploy.";
    } else {
      msg = res.statusText || `HTTP ${res.status}`;
    }
    throw new Error(userFacingApiDetail(msg || "Request failed"));
  }

  if (body === undefined) {
    const preview = trimmed.slice(0, 200);
    const htmlHint = trimmed.startsWith("<") ? " Received HTML, not JSON — the /api proxy may point at the wrong host." : "";
    throw new Error(
      userFacingApiDetail(`Invalid JSON from server.${htmlHint} Preview: ${preview || "(empty)"}`),
    );
  }
  if (body === null || typeof body !== "object") {
    throw new Error(
      userFacingApiDetail(`Unexpected response body (${typeof body}). Check API proxy and /auth routes.`),
    );
  }

  return body as T;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const fromSession = readAuthItem(TOKEN_KEY);
  if (fromSession?.trim()) return fromSession;
  /** Middleware uses this cookie on refresh; if session was cleared, recover so /auth/me can run */
  const fromCookie = readCookieRaw(COOKIE_NAME);
  if (fromCookie?.trim()) {
    writeAuthItem(TOKEN_KEY, fromCookie);
    return fromCookie;
  }
  return null;
}

export function getStoredRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  const raw = readAuthItem(REFRESH_TOKEN_KEY);
  return raw?.trim() ? raw : null;
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = readAuthItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export async function storeAuth(
  token: string,
  user: AuthUser,
  refreshToken?: string | null,
): Promise<void> {
  writeAuthItem(TOKEN_KEY, token);
  writeAuthItem(USER_KEY, JSON.stringify(user));
  writeAuthItem(SESSION_TIMESTAMP_KEY, String(Date.now()));
  if (refreshToken?.trim()) {
    writeAuthItem(REFRESH_TOKEN_KEY, refreshToken.trim());
  }
  for (const key of LEGACY_LS_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  setCookie(COOKIE_NAME, token, 60 * 60 * 8);
  setCookie(SESSION_COOKIE, "1", 60 * 60 * 8);
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0);
  });
  window.dispatchEvent(new Event("industryprime-auth-change"));
}

function unregisterServiceWorkers(): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const reg of regs) void reg.unregister();
  });
}

/**
 * Full page navigation after login/signup (production-safe).
 * Uses `location.assign` so the browser sends session cookies on the next request.
 */
export function navigateAfterAuth(path: string, options?: { force?: boolean }): void {
  if (typeof window === "undefined") return;
  const dest = path.startsWith("/") ? path : `/${path}`;
  const publicDest =
    dest === "/login" ||
    dest === "/signup" ||
    dest.startsWith("/signup/") ||
    dest === "/attendance-entry" ||
    dest === "/attendance-upload";
  if (
    !options?.force &&
    !publicDest &&
    !getStoredToken() &&
    !hasServerSessionCookie()
  ) {
    return;
  }
  unregisterServiceWorkers();
  window.location.assign(dest);
}

/** Drop stale session cookies when localStorage was cleared (breaks proxy redirect loops). */
export function clearStaleSessionIfNeeded(): void {
  if (typeof window === "undefined") return;
  if (!getStoredToken() && hasServerSessionCookie()) {
    clearAuth();
  }
}

/** If soft navigation fails (PWA/cache), force redirect so login never sticks on "Logging in…". */
export function scheduleAuthNavigationFallback(path: string, delayMs = 2500): void {
  if (typeof window === "undefined") return;
  const dest = path.startsWith("/") ? path : `/${path}`;
  window.setTimeout(() => {
    if (window.location.pathname.replace(/\/$/, "") === "/login") {
      window.location.href = dest;
    }
  }, delayMs);
}

export function clearAuth(): void {
  for (const key of LEGACY_LS_KEYS) {
    removeAuthItem(key);
  }
  clearCookie(COOKIE_NAME);
  clearCookie(SESSION_COOKIE);
  window.dispatchEvent(new Event("industryprime-auth-change"));
}

let refreshInFlight: Promise<AuthUser | null> | null = null;

/** FMS-style: refresh access token using refresh_token; returns user or null on failure. */
export async function refreshAccessToken(): Promise<AuthUser | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const data = await authRequest<AuthResponse>("/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!data?.access_token || !data?.user) return null;
      await storeAuth(data.access_token, data.user, data.refresh_token ?? refreshToken);
      return data.user;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/** Proactive refresh every 50 min + once when tab regains focus (FMS AuthProvider pattern). */
export function setupAuthSessionMaintenance(): () => void {
  if (typeof window === "undefined") return () => undefined;

  let refreshTimer: number | null = null;

  const tick = () => {
    if (!getStoredRefreshToken() && !getStoredToken()) return;
    void refreshAccessToken().then((user) => {
      if (!user && getStoredToken()) {
        void revalidateSessionUser().then((fresh) => {
          if (!fresh) clearAuth();
        });
      }
    });
  };

  refreshTimer = window.setInterval(tick, SESSION_REFRESH_INTERVAL_MS);

  const onFocus = () => {
    if (document.visibilityState !== "visible") return;
    if (!getStoredToken()) return;
    if (isSessionFresh()) return;
    tick();
  };

  document.addEventListener("visibilitychange", onFocus);

  return () => {
    if (refreshTimer) window.clearInterval(refreshTimer);
    document.removeEventListener("visibilitychange", onFocus);
  };
}

/** One in-flight login per email — prevents double-click / multi-submit races and rate-limit spikes. */
let loginInFlight: { key: string; promise: Promise<AuthUser> } | null = null;

export function dashboardPathForRole(role: Role | string): string {
  if (role === "user") return "/dashboard/user";
  if (role === "admin" || role === "master_admin") return "/dashboard";
  return "/login";
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const key = email.trim().toLowerCase();
  if (loginInFlight?.key === key) {
    return loginInFlight.promise;
  }

  const promise = (async () => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await authRequest<AuthResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email: key, password }),
        });
        if (!data?.access_token || !data?.user) {
          throw new Error(
            userFacingApiDetail(
              "Login response was missing a token or user profile. Confirm NEXT_PUBLIC_API_URL points at your FastAPI app on Render.",
            ),
          );
        }
        await storeAuth(data.access_token, data.user, data.refresh_token);
        return data.user;
      } catch (err) {
        lastErr = err;
        if (attempt < 2 && isRetryableAuthError(err)) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("Login failed");
  })();

  loginInFlight = { key, promise };
  try {
    return await promise;
  } finally {
    if (loginInFlight?.key === key) loginInFlight = null;
  }
}

export async function signup(name: string, email: string, password: string): Promise<AuthUser> {
  const data = await authRequest<{ user: AuthUser }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  if (!data?.user) {
    throw new Error("Signup response was missing user data.");
  }
  return data.user;
}

export async function signupStart(name: string, email: string, password: string): Promise<SignupStartResponse> {
  return authRequest<SignupStartResponse>("/auth/signup/start", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export async function signupVerify(
  email: string,
  code: string,
  signupTicket?: string | null,
): Promise<AuthUser> {
  const body: Record<string, string> = { email, code };
  if (signupTicket?.trim()) body.signup_ticket = signupTicket.trim();
  const data = await authRequest<AuthResponse>("/auth/signup/verify", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!data?.access_token || !data?.user) {
    throw new Error("Signup verification response missing token or user profile.");
  }
  await storeAuth(data.access_token, data.user, data.refresh_token);
  return data.user;
}

export async function signupResend(
  email: string,
  signupTicket?: string | null,
): Promise<SignupStartResponse> {
  const body: Record<string, string> = { email };
  if (signupTicket?.trim()) body.signup_ticket = signupTicket.trim();
  return authRequest<SignupStartResponse>("/auth/signup/resend", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function forgotPassword(email: string): Promise<string> {
  const data = await authRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  if (data?.message == null) {
    throw new Error("Unexpected forgot-password response.");
  }
  return data.message;
}

export async function getCurrentUser(options?: { force?: boolean }): Promise<AuthUser> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  const cached = getStoredUser();
  if (!options?.force && cached && isSessionFresh()) {
    return cached;
  }
  const data = await authRequest<{ user: AuthUser }>("/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!data?.user) {
    throw new Error("Session response was missing user data.");
  }
  writeAuthItem(USER_KEY, JSON.stringify(data.user));
  markSessionFresh();
  return data.user;
}

/** Use cached user when possible; revalidate /auth/me in background. */
export async function revalidateSessionUser(): Promise<AuthUser | null> {
  if (!getStoredToken()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return refreshed;
    return null;
  }
  try {
    return await getCurrentUser({ force: true });
  } catch {
    const refreshed = await refreshAccessToken();
    if (refreshed) return refreshed;
    return null;
  }
}

export async function listUsers(): Promise<AuthUser[]> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  return authRequest<AuthUser[]>("/auth/users", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateUserRole(userId: string, role: Role): Promise<AuthUser> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  const data = await authRequest<{ user: AuthUser }>(`/auth/users/${userId}/role`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role }),
  });
  if (!data?.user) {
    throw new Error("Role update response was missing user data.");
  }
  return data.user;
}

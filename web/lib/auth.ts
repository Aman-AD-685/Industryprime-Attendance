"use client";

import { effectiveApiBase } from "@/lib/envApi";

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
  token_type: "bearer";
  user: AuthUser;
};

const TOKEN_KEY = "industryprime.authToken";
const USER_KEY = "industryprime.authUser";
const COOKIE_NAME = "industryprime_token";

/** Abort hung API calls so refresh never spins forever (esp. offline / wrong NEXT_PUBLIC_API_URL). */
const AUTH_FETCH_TIMEOUT_MS = 18_000;

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
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

async function authRequest<T>(path: string, init: RequestInit): Promise<T> {
  const base = effectiveApiBase().replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  let res: Response;
  const controller = new AbortController();
  const timeoutId =
    typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), AUTH_FETCH_TIMEOUT_MS)
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
      aborted
        ? `Auth request timed out after ${AUTH_FETCH_TIMEOUT_MS / 1000}s (base ${base}). Is FastAPI running?`
        : `Cannot reach FastAPI (base ${base}). Check NEXT_PUBLIC_API_URL / API proxy, backend status, and CORS.`,
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
    } else if (res.status === 502 || res.status === 503 || res.status === 504) {
      msg =
        "Cannot reach the API server (bad gateway). On Vercel, set BACKEND_PROXY_TARGET or NEXT_PUBLIC_API_URL to your live FastAPI base URL, then redeploy.";
    } else {
      msg = res.statusText || `HTTP ${res.status}`;
    }
    throw new Error(msg || "Request failed");
  }

  if (body === undefined) {
    const preview = trimmed.slice(0, 200);
    const htmlHint = trimmed.startsWith("<") ? " Received HTML, not JSON — the /api proxy may point at the wrong host." : "";
    throw new Error(`Invalid JSON from server.${htmlHint} Preview: ${preview || "(empty)"}`);
  }
  if (body === null || typeof body !== "object") {
    throw new Error(`Unexpected response body (${typeof body}). Check API proxy and /auth routes.`);
  }

  return body as T;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  const fromLs = window.localStorage.getItem(TOKEN_KEY);
  if (fromLs && fromLs.trim()) return fromLs;
  /** Middleware uses this cookie on refresh; if LS was cleared/out of sync, recover so /auth/me can run */
  const fromCookie = readCookieRaw(COOKIE_NAME);
  if (fromCookie && fromCookie.trim()) {
    try {
      window.localStorage.setItem(TOKEN_KEY, fromCookie);
    } catch {
      /* private mode / quota */
    }
    return fromCookie;
  }
  return null;
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function storeAuth(token: string, user: AuthUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  setCookie(COOKIE_NAME, token, 60 * 60 * 8);
  window.dispatchEvent(new Event("industryprime-auth-change"));
}

export function clearAuth() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  clearCookie(COOKIE_NAME);
  window.dispatchEvent(new Event("industryprime-auth-change"));
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const data = await authRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!data?.access_token || !data?.user) {
    throw new Error(
      "Login response was missing a token or user profile. Confirm /api proxies to your FastAPI app (see BACKEND_PROXY_TARGET / NEXT_PUBLIC_API_URL on Vercel).",
    );
  }
  storeAuth(data.access_token, data.user);
  return data.user;
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

export async function getCurrentUser(): Promise<AuthUser> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  const data = await authRequest<{ user: AuthUser }>("/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!data?.user) {
    throw new Error("Session response was missing user data.");
  }
  window.localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
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

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
  try {
    res = await fetch(`${base}${p}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
  } catch {
    throw new Error(
      `Cannot reach FastAPI (base ${base}). Check NEXT_PUBLIC_API_URL / next.config rewrites, backend status, and CORS.`
    );
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.detail || body?.message || res.statusText || "Request failed");
  }
  return body as T;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
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
  storeAuth(data.access_token, data.user);
  return data.user;
}

export async function signup(name: string, email: string, password: string): Promise<AuthUser> {
  const data = await authRequest<{ user: AuthUser }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
  return data.user;
}

export async function forgotPassword(email: string): Promise<string> {
  const data = await authRequest<{ message: string }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
  return data.message;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  const data = await authRequest<{ user: AuthUser }>("/auth/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
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
  return data.user;
}

"use client";

import { getStoredToken } from "@/lib/auth";
import { API_BASE, effectiveApiBase } from "@/lib/envApi";

export { API_BASE };

/** FastAPI often returns `{ "detail": "..." }` — show plain text in the UI instead of raw JSON. */
function formatBackendError(body: string): string {
  const t = body.trim();
  if (!t) return t;
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    const d = j.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      return d
        .map((item) => {
          if (typeof item === "object" && item !== null && "msg" in item) {
            return String((item as { msg: string }).msg);
          }
          return String(item);
        })
        .join("; ");
    }
    if (d !== undefined && d !== null) return String(d);
  } catch {
    /* not JSON */
  }
  return t;
}

export async function getAccessToken(): Promise<string | null> {
  return getStoredToken();
}

/**
 * Backend-owned auth does not need a Supabase Auth profile bootstrap.
 * Kept as a no-op for older feature pages that still call it.
 */
export async function ensureTenantProfile(): Promise<void> {
  return;
}

export async function apiFetch<T = any>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getAccessToken();

  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const raw = effectiveApiBase();
  const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${p}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
    });
  } catch (e) {
    const hint =
      " Check that FastAPI is running and `next.config.ts` rewrites `/api` → your API (or set NEXT_PUBLIC_API_URL to match this page’s origin). " +
      `Tried base: ${raw}. Try: cd backend && uvicorn main:app --reload`;
    throw new Error(
      (e instanceof Error ? e.message : "Failed to fetch") + "." + hint,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatBackendError(text) || res.statusText);
  }
  return (await res.json()) as T;
}

export async function apiFetchBlob(path: string, init?: RequestInit): Promise<Blob> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const raw = effectiveApiBase();
  const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${base}${p}`;
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (e) {
    const hint =
      " Check that FastAPI is running and `next.config.ts` rewrites `/api` → your API (or set NEXT_PUBLIC_API_URL to match this page’s origin). " +
      `Tried base: ${raw}. Try: cd backend && uvicorn main:app --reload`;
    throw new Error((e instanceof Error ? e.message : "Failed to fetch") + "." + hint);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatBackendError(text) || res.statusText);
  }
  return res.blob();
}

/**
 * Public `/attendance-entry` calls must use same-origin `/api` so Next.js rewrites
 * reach FastAPI without CORS. Do not use `NEXT_PUBLIC_API_URL` here — localhost vs
 * 127.0.0.1 would otherwise break the browser fetch.
 */
const PUBLIC_ENTRY_API_BASE = "/api";

/** Public endpoints (no auth cookie / bearer). Used by `/attendance-entry`. */
export async function publicApiFetch<T = unknown>(
  pathWithQuery: string,
  init?: RequestInit,
): Promise<T> {
  const base = PUBLIC_ENTRY_API_BASE.endsWith("/")
    ? PUBLIC_ENTRY_API_BASE.slice(0, -1)
    : PUBLIC_ENTRY_API_BASE;
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const url = `${base}${path}`;
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
    });
  } catch (e) {
    const hint =
      " Same-origin `/api` → FastAPI (see web/next.config.ts `rewrites`). " +
      "Start the backend (e.g. uvicorn on port 8000), set BACKEND_PROXY_TARGET if it is not 127.0.0.1:8000, then restart `npm run dev`.";
    throw new Error((e instanceof Error ? e.message : "Failed to fetch") + "." + hint);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(formatBackendError(text) || res.statusText);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
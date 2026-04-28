"use client";

import { getStoredToken } from "@/lib/auth";

// Backend base URL — override with NEXT_PUBLIC_API_URL in .env.local if needed
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

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

  const url = `${API_BASE}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
    });
  } catch (e) {
    const hint =
      " Check that the FastAPI server is running and `NEXT_PUBLIC_API_URL` matches its port " +
      `(currently ${API_BASE}). Try: cd backend && uvicorn main:app --reload`;
    throw new Error(
      (e instanceof Error ? e.message : "Failed to fetch") + "." + hint,
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || res.statusText);
  }
  return (await res.json()) as T;
}
/** True if the value is an absolute http(s) URL (not a Windows path like `C:\...`). */
export function isAbsoluteHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function publicApiUrlFromEnv(): string {
  const raw =
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL?.trim()) || "";
  return isAbsoluteHttpUrl(raw) ? raw : "";
}

/**
 * Backend origin from env (build-time). When unset or invalid, same-origin `/api`.
 */
export const API_BASE = publicApiUrlFromEnv() || "/api";

/**
 * Resolve the base URL at **request time** in the browser.
 * If `NEXT_PUBLIC_API_URL` is another origin (e.g. `http://127.0.0.1:8000` while the app
 * runs on `http://localhost:3000`), use `/api` so Next.js proxies and CORS is avoided.
 * Invalid values (file paths, typos) fall back to `/api` so fetch never uses a bogus host.
 */
export function effectiveApiBase(): string {
  const env = publicApiUrlFromEnv();
  if (typeof window === "undefined") {
    return env || "http://127.0.0.1:8000";
  }
  if (!env) return "/api";
  try {
    if (new URL(env).origin !== window.location.origin) {
      return "/api";
    }
  } catch {
    return "/api";
  }
  return env;
}

/**
 * Email approve/reject pages: call FastAPI directly from the browser when origins differ.
 * Skips the Vercel `/api` proxy, which can time out (~10s) while Render cold-starts (30s+).
 * CORS on the API allows `*.vercel.app` (see backend `main.py`).
 */
export function leaveEmailDecisionApiBase(): string {
  const env = publicApiUrlFromEnv();
  if (typeof window === "undefined") {
    return env || "/api";
  }
  if (!env) return "/api";
  try {
    const trimmed = env.endsWith("/") ? env.slice(0, -1) : env;
    if (new URL(trimmed).origin !== window.location.origin) {
      return trimmed;
    }
    return trimmed;
  } catch {
    return "/api";
  }
}

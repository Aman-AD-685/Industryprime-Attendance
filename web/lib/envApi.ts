/**
 * Backend origin from env (build-time). When unset, same-origin `/api` (Next rewrites).
 */
export const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_URL?.trim()) || "/api";

/**
 * Resolve the base URL at **request time** in the browser.
 * If `NEXT_PUBLIC_API_URL` is another origin (e.g. `http://127.0.0.1:8000` while the app
 * runs on `http://localhost:3000`), use `/api` so Next.js proxies and CORS is avoided.
 */
export function effectiveApiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL?.trim() || "";
  if (typeof window === "undefined") {
    return env || "http://127.0.0.1:8000";
  }
  if (!env) return "/api";
  try {
    if (new URL(env).origin !== window.location.origin) {
      return "/api";
    }
  } catch {
    return env;
  }
  return env;
}

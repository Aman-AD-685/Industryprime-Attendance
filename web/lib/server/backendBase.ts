import { isAbsoluteHttpUrl } from "@/lib/envApi";

function trimTrailingPathSeparators(s: string): string {
  return s.replace(/[/\\]+$/, "");
}

/** Same origin resolution as `app/api/[[...slug]]/route.ts` for server-side fetches to FastAPI. */
export function serverBackendBase(): string {
  const explicit = process.env.BACKEND_PROXY_TARGET?.trim();
  if (explicit && isAbsoluteHttpUrl(explicit)) {
    return trimTrailingPathSeparators(explicit);
  }
  if (process.env.NODE_ENV === "development") {
    return "http://127.0.0.1:8000";
  }
  const pub = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (pub && isAbsoluteHttpUrl(pub)) return trimTrailingPathSeparators(pub);
  return "http://127.0.0.1:8000";
}

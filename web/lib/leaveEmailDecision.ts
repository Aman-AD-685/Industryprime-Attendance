import { formatBackendError } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/apiFetchWithTimeout";
import { leaveEmailDecisionApiBase } from "@/lib/envApi";

export type LeaveDecisionPreview = {
  request: {
    id: string;
    leave_date_start?: string;
    leave_date_end?: string;
    leave_type?: string;
    reason?: string;
    status?: string;
  };
  action: "approve" | "reject";
  already_decided: boolean;
};

/** Render cold start + email decision can exceed the default 12s app timeout. */
const LEAVE_DECISION_TIMEOUT_MS = 60_000;

function leaveApiUrl(path: string): string {
  const raw = leaveEmailDecisionApiBase();
  const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error) {
    if (e.name === "AbortError") return true;
    const m = e.message.toLowerCase();
    return m.includes("aborted") || m.includes("abort");
  }
  return false;
}

function toLeaveDecisionFetchError(e: unknown): Error {
  if (isAbortError(e)) {
    return new Error(
      "The server took too long to respond (it may be waking up). Wait a few seconds, then open the latest Approve or Reject link from your email and try again.",
    );
  }
  if (e instanceof Error) return e;
  return new Error(String(e));
}

function isRetryableError(e: Error): boolean {
  const m = e.message.toLowerCase();
  return (
    isAbortError(e) ||
    m.includes("too long") ||
    m.includes("failed to fetch") ||
    m.includes("network") ||
    m.includes("temporarily unavailable")
  );
}

async function leaveDecisionFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init, LEAVE_DECISION_TIMEOUT_MS);
  } catch (e) {
    throw toLeaveDecisionFetchError(e);
  }
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(formatBackendError(text) || "Request failed");
  }
  return JSON.parse(text) as T;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function fetchLeaveDecisionPreview(
  leaveId: string,
  token: string,
): Promise<LeaveDecisionPreview> {
  const url = `${leaveApiUrl("/leave/decision-preview")}?${new URLSearchParams({
    leave_id: leaveId,
    token,
  })}`;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await leaveDecisionFetch(url, { cache: "no-store" });
      return await readJsonResponse<LeaveDecisionPreview>(res);
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      if (attempt === 0 && isRetryableError(lastErr)) {
        await sleep(2000);
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr ?? new Error("Could not load leave request");
}

export async function submitLeaveEmailApprove(token: string, remarks: string): Promise<{ message?: string }> {
  const res = await leaveDecisionFetch(leaveApiUrl("/leave/approve"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, remarks: remarks.trim() }),
  });
  return readJsonResponse<{ message?: string }>(res);
}

export async function submitLeaveEmailReject(token: string, remarks: string): Promise<{ message?: string }> {
  const res = await leaveDecisionFetch(leaveApiUrl("/leave/reject"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, remarks: remarks.trim() }),
  });
  return readJsonResponse<{ message?: string }>(res);
}

export { isLeaveEmailPublicPath } from "@/lib/leaveEmailPublicPaths";

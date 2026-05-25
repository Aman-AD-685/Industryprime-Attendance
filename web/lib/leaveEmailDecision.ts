import { formatBackendError } from "@/lib/api";
import { DEFAULT_API_TIMEOUT_MS, fetchWithTimeout } from "@/lib/apiFetchWithTimeout";
import { effectiveApiBase } from "@/lib/envApi";

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

function leaveApiUrl(path: string): string {
  const raw = effectiveApiBase();
  const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(formatBackendError(text) || "Request failed");
  }
  return JSON.parse(text) as T;
}

export async function fetchLeaveDecisionPreview(
  leaveId: string,
  token: string,
): Promise<LeaveDecisionPreview> {
  const url = `${leaveApiUrl("/leave/decision-preview")}?${new URLSearchParams({
    leave_id: leaveId,
    token,
  })}`;
  const res = await fetchWithTimeout(url, { cache: "no-store" }, DEFAULT_API_TIMEOUT_MS);
  return readJsonResponse<LeaveDecisionPreview>(res);
}

export async function submitLeaveEmailApprove(token: string, remarks: string): Promise<{ message?: string }> {
  const res = await fetchWithTimeout(
    leaveApiUrl("/leave/approve"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, remarks: remarks.trim() }),
    },
    DEFAULT_API_TIMEOUT_MS,
  );
  return readJsonResponse<{ message?: string }>(res);
}

export async function submitLeaveEmailReject(token: string, remarks: string): Promise<{ message?: string }> {
  const res = await fetchWithTimeout(
    leaveApiUrl("/leave/reject"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, remarks: remarks.trim() }),
    },
    DEFAULT_API_TIMEOUT_MS,
  );
  return readJsonResponse<{ message?: string }>(res);
}

export { isLeaveEmailPublicPath } from "@/lib/leaveEmailPublicPaths";

"use client";

import { getStoredToken } from "@/lib/auth";

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const rel = path.startsWith("/") ? path : `/${path}`;
  const url = `/api/admin${rel}`;
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = JSON.parse(text) as { detail?: string };
      if (typeof j.detail === "string") msg = j.detail;
    } catch {
      if (text) msg = text.slice(0, 200);
    }
    throw new Error(msg);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export async function fetchAdminAudit(): Promise<{ events: import("@/lib/admin/mockStore").AuditEvent[] }> {
  return adminFetch("/audit");
}

/** Dashboard (`/`) overview mocks — swap implementations for real fetches later. */
export type {
  AuditEvent,
  DashboardRole,
  DeptSlice,
  KpiSnapshot,
  LateArrival,
  LeaveRequest,
  TrendPoint,
} from "@/lib/admin/dashboardMockStore";

export {
  buildTrend,
  dashboardKpiPlaceholder,
  decideLeave,
  getApprovedLeaves,
  getAudit,
  getDepartments,
  getKpis,
  getLateArrivals,
  getPendingLeaves,
  getTrend,
  notifyEmployee,
  notifyEmployees,
  restoreLastLeave,
} from "@/lib/admin/dashboardMockStore";

export type { ApprovedLeaveRow } from "@/lib/admin/dashboardMockStore";

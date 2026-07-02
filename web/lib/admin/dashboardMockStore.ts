/** Client-side store for `/dashboard` extras; KPI headcounts merge with GET /dashboard/summary when online. */

import { apiFetch, DASHBOARD_API_TIMEOUT_MS } from "@/lib/api";

export type DashboardRole = "user" | "admin" | "master_admin";

export type KpiSnapshot = {
  totalEmployees: number;
  presentToday: number;
  absent: number;
  absentUnplanned: number;
  absentOnLeave: number;
  late: number;
  lateDeltaVsYesterday: number;
  onApprovedLeave: number;
  pendingLeaveRequests: number;
  newJoinersThisMonth: number;
};

export type TrendPoint = { date: string; present: number; late: number; absent: number };

export type DeptSlice = { name: string; count: number };

export type LateArrival = {
  id: string;
  empId: string;
  name: string;
  dept: string;
  checkIn: string;
  lateMinutes: number;
  avatarColor: string;
};

export type LeaveRequest = {
  id: string;
  empId: string;
  name: string;
  dept: string;
  type: "casual" | "sick" | "earned";
  from: string;
  to: string;
  days: number;
  reason: string;
};

export type AuditEvent = { id: string; ts: string; actor: string; action: string; target: string; payload: Record<string, unknown> };

const g = globalThis as unknown as { __ipDashMock?: DashboardMock };

type DashboardMock = {
  kpis: KpiSnapshot;
  late: LateArrival[];
  leaves: LeaveRequest[];
  leaveUndo?: { t: number; row: LeaveRequest } | null;
};

function initialKpis(): KpiSnapshot {
  return {
    totalEmployees: 126,
    presentToday: 108,
    absent: 9,
    absentUnplanned: 3,
    absentOnLeave: 6,
    late: 12,
    lateDeltaVsYesterday: 5,
    onApprovedLeave: 6,
    pendingLeaveRequests: 3,
    newJoinersThisMonth: 4,
  };
}

/** Instant KPI shell while `/dashboard/summary` loads (zeros, not mock demo numbers). */
export function dashboardKpiPlaceholder(): KpiSnapshot {
  return {
    totalEmployees: 0,
    presentToday: 0,
    absent: 0,
    absentUnplanned: 0,
    absentOnLeave: 0,
    late: 0,
    lateDeltaVsYesterday: 0,
    onApprovedLeave: 0,
    pendingLeaveRequests: 0,
    newJoinersThisMonth: 0,
  };
}

function initialLate(): LateArrival[] {
  const rows: Omit<LateArrival, "id">[] = [
    { empId: "EMP-1042", name: "Sourav Roy", dept: "Sales", checkIn: "10:18 AM", lateMinutes: 78, avatarColor: "bg-red-100" },
    { empId: "EMP-1108", name: "Priya Das", dept: "Engineering", checkIn: "09:55 AM", lateMinutes: 25, avatarColor: "bg-blue-100" },
    { empId: "EMP-1021", name: "Arjun Kapoor", dept: "Operations", checkIn: "10:12 AM", lateMinutes: 42, avatarColor: "bg-amber-100" },
    { empId: "EMP-1077", name: "Nila Kar", dept: "HR · Admin", checkIn: "09:48 AM", lateMinutes: 18, avatarColor: "bg-purple-100" },
    { empId: "EMP-1003", name: "Rahul Verma", dept: "Engineering", checkIn: "10:05 AM", lateMinutes: 35, avatarColor: "bg-blue-100" },
    { empId: "EMP-1004", name: "Sneha Kulkarni", dept: "HR · Admin", checkIn: "09:51 AM", lateMinutes: 21, avatarColor: "bg-purple-100" },
    { empId: "EMP-1005", name: "Priya Nair", dept: "Operations", checkIn: "10:22 AM", lateMinutes: 52, avatarColor: "bg-amber-100" },
    { empId: "EMP-1006", name: "Vikram Singh", dept: "Sales", checkIn: "10:08 AM", lateMinutes: 38, avatarColor: "bg-red-100" },
    { empId: "EMP-1007", name: "Ananya Ghosh", dept: "Engineering", checkIn: "09:44 AM", lateMinutes: 14, avatarColor: "bg-blue-100" },
    { empId: "EMP-1008", name: "Karan Mehta", dept: "Sales", checkIn: "10:30 AM", lateMinutes: 60, avatarColor: "bg-red-100" },
    { empId: "EMP-1009", name: "Divya Iyer", dept: "Operations", checkIn: "09:39 AM", lateMinutes: 9, avatarColor: "bg-amber-100" },
    { empId: "EMP-1010", name: "Neha Joshi", dept: "Engineering", checkIn: "10:15 AM", lateMinutes: 45, avatarColor: "bg-blue-100" },
  ];
  return rows.map((r, i) => ({ ...r, id: `late-${i + 1}` }));
}

function initialLeaves(): LeaveRequest[] {
  return [
    {
      id: "lv-1",
      empId: "EMP-1001",
      name: "Adrija Biswas",
      dept: "Engineering",
      type: "casual",
      from: "2026-05-16",
      to: "2026-05-17",
      days: 2,
      reason: "Family function",
    },
    {
      id: "lv-2",
      empId: "EMP-1002",
      name: "Akash Das",
      dept: "Operations",
      type: "sick",
      from: "2026-05-18",
      to: "2026-05-18",
      days: 1,
      reason: "Medical appointment",
    },
    {
      id: "lv-3",
      empId: "EMP-1042",
      name: "Sourav Roy",
      dept: "Sales",
      type: "casual",
      from: "2026-05-20",
      to: "2026-05-21",
      days: 2,
      reason: "Family function",
    },
  ];
}

function initialAudit(): AuditEvent[] {
  const verbs = ["approved leave", "edited attendance", "exported payroll", "invited user", "changed role"];
  const now = Date.now();
  return Array.from({ length: 20 }).map((_, i) => ({
    id: `aud-${i}`,
    ts: new Date(now - i * 61_000).toISOString(),
    actor: i % 2 === 0 ? "Aman (master_admin)" : "Admin Bot",
    action: verbs[i % verbs.length]!,
    target: `employee:${200 + i}`,
    payload: { index: i, note: "stub" },
  }));
}

function getStore(): DashboardMock {
  if (!g.__ipDashMock) {
    g.__ipDashMock = {
      kpis: initialKpis(),
      late: initialLate(),
      leaves: initialLeaves(),
    };
  }
  return g.__ipDashMock;
}

export function resetDashboardMock() {
  g.__ipDashMock = {
    kpis: initialKpis(),
    late: initialLate(),
    leaves: initialLeaves(),
  };
}

type ApiSummary = {
  total_employees: number;
  present_today: number;
  absent: number;
  late: number;
  as_of?: string;
  pending_leave_requests?: number;
};

export async function getKpis(): Promise<KpiSnapshot> {
  await new Promise((r) => setTimeout(r, 0));
  const s = getStore();
  s.kpis.pendingLeaveRequests = s.leaves.length;

  try {
    const j = await apiFetch<ApiSummary>("/dashboard/summary", undefined, DASHBOARD_API_TIMEOUT_MS);
    const absent = Math.max(0, j.absent);
    const unplanned = absent <= 1 ? absent : Math.max(1, Math.floor(absent * 0.4));
    const pending =
      typeof j.pending_leave_requests === "number" ? j.pending_leave_requests : s.leaves.length;
    return {
      ...s.kpis,
      totalEmployees: j.total_employees,
      presentToday: j.present_today,
      absent,
      absentUnplanned: unplanned,
      absentOnLeave: Math.max(0, absent - unplanned),
      late: j.late,
      pendingLeaveRequests: pending,
    };
  } catch {
    s.kpis.late = s.late.length;
    return { ...s.kpis };
  }
}

export function buildTrend(range: "14d" | "30d"): TrendPoint[] {
  const n = range === "14d" ? 14 : 30;
  const out: TrendPoint[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const u = (n - 1 - i) / Math.max(n - 1, 1);
    out.push({
      date: d.toISOString().slice(0, 10),
      present: Math.round(100 + 18 * u + 6 * Math.sin(u * Math.PI * 2)),
      late: Math.round(8 + 5 * u + 3 * Math.sin(u * Math.PI * 2.5)),
      absent: Math.round(8 - 3 * u + 2 * Math.cos(u * Math.PI * 1.8)),
    });
  }
  if (out.length) {
    out[out.length - 1]!.present = 108;
    out[out.length - 1]!.late = 12;
    out[out.length - 1]!.absent = 9;
  }
  return out;
}

export async function getTrend(range: "14d" | "30d"): Promise<TrendPoint[]> {
  const days = range === "14d" ? 14 : 30;
  try {
    return await apiFetch<TrendPoint[]>(`/dashboard/trend?days=${days}`, undefined, DASHBOARD_API_TIMEOUT_MS);
  } catch {
    await new Promise((r) => setTimeout(r, 0));
    return buildTrend(range);
  }
}

export async function getDepartments(): Promise<DeptSlice[]> {
  try {
    return await apiFetch<DeptSlice[]>("/dashboard/departments/present", undefined, DASHBOARD_API_TIMEOUT_MS);
  } catch {
    await new Promise((r) => setTimeout(r, 0));
    return [
      { name: "Sales", count: 52 },
      { name: "Engineering", count: 34 },
      { name: "Operations", count: 19 },
      { name: "HR · Admin", count: 11 },
    ];
  }
}

export type ApprovedLeaveRow = {
  id: string;
  employee_name?: string | null;
  employee_code?: string | null;
  leave_type?: string | null;
  leave_date_start?: string | null;
  leave_date_end?: string | null;
  days?: number;
  approved_at?: string | null;
  decided_by_email?: string | null;
  approved_by?: string | null;
  remarks?: string | null;
};

export async function getApprovedLeaves(): Promise<ApprovedLeaveRow[]> {
  const params = new URLSearchParams({
    status: "approved",
  });
  const data = await apiFetch<ApprovedLeaveRow[]>(`/leave/requests?${params.toString()}`);
  return Array.isArray(data) ? data : [];
}

export async function getLateArrivals(filter?: string | null): Promise<LateArrival[]> {
  try {
    const sp = new URLSearchParams();
    if (filter) sp.set("department", filter);
    const q = sp.toString();
    return await apiFetch<LateArrival[]>(`/dashboard/late-today${q ? `?${q}` : ""}`, undefined, DASHBOARD_API_TIMEOUT_MS);
  } catch {
    await new Promise((r) => setTimeout(r, 0));
    const s = getStore().late;
    if (!filter) return [...s];
    return s.filter((r) => r.dept === filter);
  }
}

function mapLeaveType(raw: string): LeaveRequest["type"] {
  const s = raw.toLowerCase();
  if (s.includes("sick")) return "sick";
  if (s.includes("earn") || s.includes("annual") || s.includes("privilege")) return "earned";
  return "casual";
}

export async function getPendingLeaves(): Promise<LeaveRequest[]> {
  try {
    const rows = await apiFetch<
      {
        id: string;
        empId: string;
        name: string;
        dept: string;
        type: string;
        from: string;
        to: string;
        days: number;
        reason: string;
      }[]
    >("/dashboard/pending-leaves", undefined, DASHBOARD_API_TIMEOUT_MS);
    return rows.map((r) => ({
      ...r,
      type: mapLeaveType(r.type || "casual"),
    }));
  } catch {
    await new Promise((r) => setTimeout(r, 0));
    return [...getStore().leaves];
  }
}

export async function decideLeave(id: string, decision: "approve" | "reject" | "unapprove"): Promise<{ ok: boolean }> {
  const seg = decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "unapproved";
  try {
    await apiFetch(`/leave/requests/${encodeURIComponent(id)}/${seg}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ not_deducted_days: 0 }),
    });
    return { ok: true };
  } catch {
    const store = getStore();
    const idx = store.leaves.findIndex((l) => l.id === id);
    if (idx === -1) return { ok: false };
    const [row] = store.leaves.splice(idx, 1);
    store.leaveUndo = { t: Date.now(), row };
    store.kpis.pendingLeaveRequests = store.leaves.length;
    return { ok: true };
  }
}

export async function restoreLastLeave(): Promise<boolean> {
  const store = getStore();
  const u = store.leaveUndo;
  if (!u) return false;
  if (!store.leaves.some((l) => l.id === u.row.id)) {
    store.leaves.unshift(u.row);
  }
  store.leaveUndo = null;
  store.kpis.pendingLeaveRequests = store.leaves.length;
  return true;
}

export async function notifyEmployee(id: string): Promise<{ ok: boolean; name?: string }> {
  try {
    const rows = await apiFetch<LateArrival[]>("/dashboard/late-today");
    const row = rows.find((l) => l.id === id || l.empId === id);
    if (row) return { ok: true, name: row.name };
  } catch {
    /* fall through mock */
  }
  const store = getStore();
  const idx = store.late.findIndex((l) => l.id === id || l.empId === id);
  if (idx === -1) return { ok: false };
  const [row] = store.late.splice(idx, 1);
  store.kpis.late = store.late.length;
  return { ok: true, name: row.name };
}

export async function notifyEmployees(ids: string[]): Promise<{ ok: boolean; count: number }> {
  try {
    await apiFetch<LateArrival[]>("/dashboard/late-today");
    return { ok: true, count: ids.length };
  } catch {
    const store = getStore();
    let c = 0;
    for (const id of ids) {
      const idx = store.late.findIndex((l) => l.id === id || l.empId === id);
      if (idx !== -1) {
        store.late.splice(idx, 1);
        c++;
      }
    }
    store.kpis.late = store.late.length;
    return { ok: true, count: c };
  }
}

let auditCache: AuditEvent[] | null = null;

export async function getAudit(limit = 20): Promise<AuditEvent[]> {
  try {
    return await apiFetch<AuditEvent[]>(`/dashboard/audit?limit=${limit}`, undefined, DASHBOARD_API_TIMEOUT_MS);
  } catch {
    await new Promise((r) => setTimeout(r, 0));
    if (!auditCache) auditCache = initialAudit();
    return auditCache.slice(0, limit).map((e) => ({ ...e, payload: { ...e.payload } }));
  }
}

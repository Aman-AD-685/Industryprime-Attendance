"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { PremiumTable, type TableColumn } from "@/components/ui/PremiumTable";

type LeaveAdminRow = {
  id: string;
  employee_id?: string;
  employee_name?: string | null;
  employee_email?: string | null;
  employee_code?: string | null;
  leave_type?: string | null;
  leave_date_start?: string | null;
  leave_date_end?: string | null;
  status?: string | null;
  created_at?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_by?: string | null;
  rejected_at?: string | null;
  decided_by_email?: string | null;
  remarks?: string | null;
  rejection_remarks?: string | null;
  reason?: string | null;
};

type EmployeeOption = { id: string; name?: string | null; employee_code?: string | null };

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (s === "approved")
    return (
      <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-100">
        Approved
      </span>
    );
  if (s === "rejected" || s === "unapproved")
    return (
      <span className="inline-flex rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-900 dark:bg-rose-500/20 dark:text-rose-100">
        Rejected
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100">
      Pending
    </span>
  );
}

export default function LeaveAdminPage() {
  const now = useMemo(() => new Date(), []);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [rows, setRows] = useState<LeaveAdminRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [employeeId, setEmployeeId] = useState("");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("status", statusFilter === "all" ? "all" : statusFilter);
      if (employeeId) params.set("employee_id", employeeId);
      params.set("year", String(year));
      params.set("month", String(month));
      const data = await apiFetch<LeaveAdminRow[]>(`/leave/requests?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, employeeId, year, month]);

  useEffect(() => {
    const u = getStoredUser();
    setCurrentUser(u);
    if (u?.role !== "master_admin") {
      setLoading(false);
      setError("Only Master Admin can access this page.");
      return;
    }
    void (async () => {
      try {
        const em = await apiFetch<EmployeeOption[]>("/employees?status=active");
        setEmployees(Array.isArray(em) ? em : []);
      } catch {
        setEmployees([]);
      }
    })();
  }, []);

  useEffect(() => {
    if (currentUser?.role !== "master_admin") return;
    void load();
  }, [currentUser, load]);

  const columns: TableColumn<LeaveAdminRow>[] = useMemo(
    () => [
      {
        key: "employee",
        title: "Employee",
        sortValue: (r) => String(r.employee_name || r.employee_code || r.employee_id || ""),
        render: (r) => (
          <div>
            <div className="font-medium text-zinc-900 dark:text-zinc-50">{r.employee_name || r.employee_code || "—"}</div>
            <div className="text-xs text-zinc-500">{r.employee_email || ""}</div>
          </div>
        ),
      },
      {
        key: "from",
        title: "From",
        sortValue: (r) => String(r.leave_date_start || ""),
        render: (r) => <span>{r.leave_date_start || "—"}</span>,
      },
      {
        key: "to",
        title: "To",
        sortValue: (r) => String(r.leave_date_end || ""),
        render: (r) => <span>{r.leave_date_end || "—"}</span>,
      },
      {
        key: "type",
        title: "Type",
        sortValue: (r) => String(r.leave_type || ""),
        render: (r) => <span>{r.leave_type || "—"}</span>,
      },
      {
        key: "status",
        title: "Status",
        sortValue: (r) => String(r.status || ""),
        render: (r) => statusBadge(String(r.status || "pending")),
      },
      {
        key: "applied",
        title: "Applied",
        sortValue: (r) => String(r.created_at || ""),
        render: (r) => <span className="text-xs text-zinc-600 dark:text-zinc-300">{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</span>,
      },
      {
        key: "by",
        title: "Approved / rejected by",
        sortValue: (r) => String(r.approved_by || r.rejected_by || r.decided_by_email || ""),
        render: (r) => (
          <span className="text-xs text-zinc-700 dark:text-zinc-200">
            {r.approved_by || r.rejected_by || r.decided_by_email || "—"}
          </span>
        ),
      },
      {
        key: "decided",
        title: "Decision date",
        sortValue: (r) => String(r.approved_at || r.rejected_at || ""),
        render: (r) => {
          const raw = r.approved_at || r.rejected_at;
          return <span className="text-xs text-zinc-600 dark:text-zinc-300">{raw ? new Date(raw).toLocaleString() : "—"}</span>;
        },
      },
      {
        key: "remarks",
        title: "Remarks",
        render: (r) => (
          <div className="max-w-xs text-xs text-zinc-600 dark:text-zinc-300">
            {r.rejection_remarks ? <span className="text-rose-700 dark:text-rose-300">Rejection: {r.rejection_remarks}</span> : null}
            {r.remarks && !r.rejection_remarks ? <span>{r.remarks}</span> : null}
            {r.rejection_remarks && r.remarks ? <div className="mt-1">Note: {r.remarks}</div> : null}
            {!r.remarks && !r.rejection_remarks ? "—" : null}
          </div>
        ),
      },
    ],
    [],
  );

  if (currentUser?.role !== "master_admin" && !loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
          {error || "Access denied."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Leave approvals (all)</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Monitor every leave request, filter by status, employee, and calendar month.</p>
      </div>

      {error && currentUser?.role === "master_admin" ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-end gap-4 rounded-3xl border border-zinc-200 bg-white/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="mt-1 block w-40 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Employee
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="mt-1 block min-w-[200px] rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name || e.employee_code || e.id}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Year
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 block w-28 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Month
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="mt-1 block w-44 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {new Date(year, m - 1, 1).toLocaleString(undefined, { month: "long" })}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-900" />
      ) : (
        <PremiumTable columns={columns} rows={rows} initialSortKey="applied" initialSortDir="desc" pageSize={15} />
      )}
    </div>
  );
}

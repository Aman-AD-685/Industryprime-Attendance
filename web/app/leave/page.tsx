"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredUser, type AuthUser } from "@/lib/auth";

type LeaveRequest = {
  id: string;
  employee_code?: string;
  leave_date_start?: string;
  leave_date_end?: string;
  leave_type?: string;
  reason?: string;
  status?: string;
  not_deducted_days?: number;
};

type LeaveSummary = {
  employee: {
    id: string;
    employee_code?: string | null;
    name?: string | null;
    email?: string | null;
  };
  year: number;
  total_leave: number;
  total_used_leave: number;
  balance_leave: number;
  requests: LeaveRequest[];
};

type LeaveForm = {
  leave_type: string;
  leave_date_start: string;
  leave_date_end: string;
  reason: string;
};

const emptyForm: LeaveForm = {
  leave_type: "",
  leave_date_start: "",
  leave_date_end: "",
  reason: "",
};

export default function LeavePage() {
  const now = useMemo(() => new Date(), []);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<LeaveSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<LeaveForm>(emptyForm);
  const [showLeaveForm, setShowLeaveForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingRequest, setSavingRequest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canManage = currentUser?.role === "master_admin" || currentUser?.role === "admin";
  const selected = rows.find((row) => row.employee.id === selectedId) || rows[0] || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<LeaveSummary[]>(`/leave/summary?year=${year}`);
      setRows(data || []);
      setSelectedId((current) => current || data?.[0]?.employee.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave data");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    setCurrentUser(getStoredUser());
    void load();
    const onAuthChange = () => setCurrentUser(getStoredUser());
    window.addEventListener("industryprime-auth-change", onAuthChange);
    return () => window.removeEventListener("industryprime-auth-change", onAuthChange);
  }, [load]);

  function selectCard(employeeId: string) {
    setSelectedId(employeeId);
    setInfo(null);
    setError(null);
  }

  async function submitLeave(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (!form.leave_type || !form.leave_date_start || !form.leave_date_end || !form.reason.trim()) {
      setError("Please fill Leave Type, From, To, and Reason.");
      return;
    }
    setSavingRequest(true);
    setError(null);
    setInfo(null);
    try {
      await apiFetch("/leave/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: selected.employee.id,
          leave_type: form.leave_type,
          leave_date_start: form.leave_date_start,
          leave_date_end: form.leave_date_end,
          reason: form.reason.trim(),
        }),
      });
      setForm(emptyForm);
      setInfo("Leave request submitted successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit leave request");
    } finally {
      setSavingRequest(false);
    }
  }

  async function updateTotalLeave(row: LeaveSummary, totalLeave: number) {
    if (!canManage) return;
    setBusyId(row.employee.id);
    setError(null);
    try {
      await apiFetch(`/leave/balances/${row.employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, total_leave: totalLeave }),
      });
      setRows((items) =>
        items.map((item) =>
          item.employee.id === row.employee.id
            ? { ...item, total_leave: totalLeave, balance_leave: Number((totalLeave - item.total_used_leave).toFixed(2)) }
            : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update leave allocation");
    } finally {
      setBusyId(null);
    }
  }

  async function decide(request: LeaveRequest, decision: "approved" | "unapproved") {
    if (!canManage) return;
    const notDeducted = decision === "unapproved" ? Number(window.prompt("How many leave days should not be deducted?", "0") || 0) : 0;
    setBusyId(request.id);
    setError(null);
    try {
      await apiFetch(`/leave/requests/${request.id}/${decision}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ not_deducted_days: notDeducted }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update leave request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Leave Management</h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Employee leave allocation, usage, balance, and approvals.
          </p>
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">Year</label>
          <input
            type="number"
            value={year}
            onChange={(event) => {
              setYear(Number(event.target.value));
              setSelectedId(null);
            }}
            className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/70 px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-100"
          />
        </div>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">{error}</div>}
      {info && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">{info}</div>}

      <div className="rounded-3xl border border-zinc-200 bg-white/75 p-5 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
        <button
          type="button"
          onClick={() => setShowLeaveForm((value) => !value)}
          className="flex w-full items-center justify-between text-left"
        >
          <span className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Leave Form</span>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-xl font-semibold leading-none text-white shadow-sm">
            {showLeaveForm ? "-" : "+"}
          </span>
        </button>

        {showLeaveForm && (
          <form onSubmit={submitLeave} className="mt-5 border-t border-zinc-200 pt-5 dark:border-zinc-800">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Employee Name">
                <input value={selected?.employee.name || selected?.employee.employee_code || ""} readOnly className="w-full cursor-not-allowed rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200" />
              </Field>
              <Field label="Leave Type*">
                <select value={form.leave_type} onChange={(event) => setForm((state) => ({ ...state, leave_type: event.target.value }))} className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-950">
                  <option value="">Select leave type</option>
                  <option value="CL">CL</option>
                  <option value="SL">SL</option>
                  <option value="PL">PL</option>
                  <option value="Unpaid">Unpaid</option>
                </select>
              </Field>
              <Field label="From*">
                <input type="date" value={form.leave_date_start} onChange={(event) => setForm((state) => ({ ...state, leave_date_start: event.target.value }))} className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-950" />
              </Field>
              <Field label="To*">
                <input type="date" value={form.leave_date_end} onChange={(event) => setForm((state) => ({ ...state, leave_date_end: event.target.value }))} className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-950" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Reason*">
                  <textarea value={form.reason} onChange={(event) => setForm((state) => ({ ...state, reason: event.target.value }))} rows={3} className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-800 dark:bg-zinc-950" />
                </Field>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={savingRequest || !selected} className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">
                {savingRequest ? "Submitting..." : "Submit Leave"}
              </button>
            </div>
          </form>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-3xl bg-zinc-100 dark:bg-zinc-900" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <button
              key={row.employee.id}
              type="button"
              onClick={() => selectCard(row.employee.id)}
              className={`rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                selected?.employee.id === row.employee.id
                  ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                  : "border-zinc-200 bg-white/75 dark:border-zinc-800 dark:bg-zinc-950/40"
              }`}
            >
              <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{row.employee.name || row.employee.employee_code}</div>
              <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{row.employee.email || "-"}</div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <Metric label="Total Leave" value={row.total_leave} />
                <Metric label="Used" value={row.total_used_leave} />
                <Metric label="Balance" value={row.balance_leave} strong />
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-3xl border border-zinc-200 bg-white/75 p-5 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{selected.employee.name || selected.employee.employee_code}</h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{selected.employee.email || "No email"}</p>
            </div>
            {canManage && (
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Total Leave (CL + SL)
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  defaultValue={selected.total_leave}
                  disabled={busyId === selected.employee.id}
                  onBlur={(event) => void updateTotalLeave(selected, Number(event.target.value))}
                  className="mt-1 block w-36 rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
            )}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Detail label="Total Leave" value={selected.total_leave} />
            <Detail label="Total Used Leave" value={selected.total_used_leave} />
            <Detail label="Balance Leave" value={selected.balance_leave} highlight />
          </div>

          <div className="mt-6 space-y-3">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Leave Requests</h4>
            {selected.requests.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-6 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">No leave requests found.</div>
            ) : (
              selected.requests.map((request) => (
                <div key={request.id} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{(request.leave_date_start || "-") + (request.leave_date_end ? ` -> ${request.leave_date_end}` : "")}</div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{request.leave_type || "Leave"} • {request.status || "pending"} {request.reason ? `• ${request.reason}` : ""}</div>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "approved")} className="rounded-2xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60">Approve</button>
                      <button type="button" disabled={busyId === request.id} onClick={() => void decide(request, "unapproved")} className="rounded-2xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60">Unapprove</button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return <div><div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div><div className={`mt-1 text-sm ${strong ? "font-bold text-emerald-700 dark:text-emerald-300" : "font-semibold text-zinc-900 dark:text-zinc-100"}`}>{value}</div></div>;
}

function Detail({ label, value, highlight = false }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${highlight ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100" : "border-zinc-200 bg-white/70 text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100"}`}><div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</div><div className="mt-2 text-lg font-bold">{value}</div></div>;
}

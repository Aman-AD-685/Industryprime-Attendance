"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { API_BASE, formatBackendError } from "@/lib/api";

type PreviewResponse = {
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

function apiUrl(path: string) {
  const base = API_BASE.endsWith("/") ? API_BASE.slice(0, -1) : API_BASE;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export default function LeaveRejectPage() {
  const search = useSearchParams();
  const leaveId = useMemo(() => (search.get("leave_id") || "").trim(), [search]);
  const token = useMemo(() => (search.get("token") || "").trim(), [search]);

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);
      if (!leaveId || !token) {
        setError("This rejection link is missing required parameters.");
        setLoading(false);
        return;
      }
      try {
        const url = `${apiUrl("/leave/decision-preview")}?${new URLSearchParams({ leave_id: leaveId, token }).toString()}`;
        const res = await fetch(url);
        const text = await res.text();
        if (!res.ok) throw new Error(formatBackendError(text) || "Invalid or expired link");
        const data = JSON.parse(text) as PreviewResponse;
        if (data.action !== "reject") {
          setPreview(null);
          setError("This link is not valid for rejection.");
        } else {
          setPreview(data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Approval link expired or invalid");
      } finally {
        setLoading(false);
      }
    }
    void run();
  }, [leaveId, token]);

  async function onReject(event: React.FormEvent) {
    event.preventDefault();
    if (!remarks.trim()) {
      setError("Remarks are required to reject this leave request.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/leave/reject"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, remarks: remarks.trim() }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(formatBackendError(text) || "Failed to reject");
      const parsed = JSON.parse(text) as { message?: string };
      setDone(parsed.message || "Leave rejected.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">Loading rejection form…</p>
      </div>
    );
  }

  if (error && !preview) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm dark:border-rose-900/50 dark:bg-zinc-900">
          <h1 className="text-lg font-semibold text-rose-800 dark:text-rose-200">Approval link expired or invalid</h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{error}</p>
        </div>
      </div>
    );
  }

  if (preview?.already_decided) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm dark:border-amber-900/40 dark:bg-zinc-900">
          <h1 className="text-lg font-semibold text-amber-900 dark:text-amber-100">Already processed</h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">This leave request has already been decided.</p>
        </div>
      </div>
    );
  }

  if (preview && preview.action !== "reject") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm dark:border-rose-900/50 dark:bg-zinc-900">
          <h1 className="text-lg font-semibold text-rose-800 dark:text-rose-200">Wrong link type</h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Use the rejection link from your email.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-zinc-50 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-lg rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Leave rejected</h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{done}</p>
          <p className="mt-4 text-xs text-zinc-500">The employee has been notified by email.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="mx-auto max-w-xl rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Reject leave request</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Dates: {preview?.request.leave_date_start || "—"} → {preview?.request.leave_date_end || "—"}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Type: {preview?.request.leave_type || "Leave"}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Reason: {preview?.request.reason || "—"}</p>

        {error && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}

        <form onSubmit={onReject} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Rejection remarks (required)
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={5}
              required
              placeholder="Explain why this leave cannot be approved"
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-rose-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
          >
            {saving ? "Submitting…" : "Submit rejection"}
          </button>
        </form>
      </div>
    </div>
  );
}

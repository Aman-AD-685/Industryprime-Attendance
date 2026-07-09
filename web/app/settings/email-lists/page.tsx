"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";

type Kind = "approval" | "notification" | "applicant";
type Item = { id: string; kind: Kind; email: string; name?: string | null; approver_email?: string | null };

function isValidEmail(email: string): boolean {
  const clean = email.trim();
  return clean.includes("@") && clean.split("@")[1]?.includes(".");
}

export default function EmailListsPage() {
  const user = getStoredUser();
  const [approval, setApproval] = useState<Item[]>([]);
  const [notification, setNotification] = useState<Item[]>([]);
  const [applicant, setApplicant] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    approval: { email: "", name: "" },
    notification: { email: "", name: "" },
    applicant: { email: "", name: "", approver_email: "" },
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [a, n, p] = await Promise.all([
        apiFetch<Item[]>("/email-lists?kind=approval"),
        apiFetch<Item[]>("/email-lists?kind=notification"),
        apiFetch<Item[]>("/email-lists?kind=applicant"),
      ]);
      setApproval(a || []);
      setNotification(n || []);
      setApplicant(p || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load email lists");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(kind: Kind) {
    const email = form[kind === "applicant" ? "applicant" : kind].email.trim().toLowerCase();
    const name = form[kind === "applicant" ? "applicant" : kind].name.trim();
    const approverEmail =
      kind === "applicant" ? form.applicant.approver_email.trim().toLowerCase() : "";
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (kind === "applicant" && !name) {
      setError("Employee name is required (e.g. Souvik Das).");
      return;
    }
    if (kind === "applicant" && !isValidEmail(approverEmail)) {
      setError("Approver email is required (who gets Approve/Reject for this ID mail).");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/email-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          email,
          name: name || null,
          approver_email: kind === "applicant" ? approverEmail : null,
        }),
      });
      if (kind === "applicant") {
        setForm((prev) => ({ ...prev, applicant: { email: "", name: "", approver_email: "" } }));
      } else {
        setForm((prev) => ({ ...prev, [kind]: { email: "", name: "" } }));
      }
      setMessage("Email list updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add recipient");
    }
  }

  async function patchItem(item: Item, patch: { name?: string; approver_email?: string }) {
    try {
      await apiFetch(`/email-lists/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update");
    }
  }

  async function remove(item: Item) {
    try {
      await apiFetch(`/email-lists/${item.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete recipient");
    }
  }

  async function sendTestEmail() {
    setTesting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiFetch<{ ok: boolean; to_email: string }>("/email-lists/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      setMessage(`Test email sent to ${res.to_email}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send test email");
    } finally {
      setTesting(false);
    }
  }

  if (!user || user.role !== "master_admin") {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">Access denied.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Email Lists</h1>
        <button
          type="button"
          disabled={testing}
          onClick={() => void sendTestEmail()}
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
        >
          {testing ? "Sending..." : "Send Test Email"}
        </button>
      </div>
      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {message && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card
          title="Approval Recipients"
          note="Default approvers when no Leave apply from row matches. Approve/Reject buttons."
          items={approval}
          form={form.approval}
          loading={loading}
          emailPlaceholder="email@company.com"
          namePlaceholder="Optional name"
          addLabel="Add recipient"
          onForm={(next) => setForm((prev) => ({ ...prev, approval: next }))}
          onAdd={() => void add("approval")}
          onRename={(item, name) => void patchItem(item, { name })}
          onDelete={(item) => void remove(item)}
        />
        <Card
          title="Notification Recipients"
          note="FYI when leave is applied (never sent to matched Leave apply from ID mail)."
          items={notification}
          form={form.notification}
          loading={loading}
          emailPlaceholder="email@company.com"
          namePlaceholder="Optional name"
          addLabel="Add recipient"
          onForm={(next) => setForm((prev) => ({ ...prev, notification: next }))}
          onAdd={() => void add("notification")}
          onRename={(item, name) => void patchItem(item, { name })}
          onDelete={(item) => void remove(item)}
        />
        <ApplicantCard
          items={applicant}
          form={form.applicant}
          loading={loading}
          onForm={(next) => setForm((prev) => ({ ...prev, applicant: next }))}
          onAdd={() => void add("applicant")}
          onPatch={(item, patch) => void patchItem(item, patch)}
          onDelete={(item) => void remove(item)}
        />
      </div>
    </div>
  );
}

function Card({
  title,
  note,
  items,
  form,
  loading,
  emailPlaceholder,
  namePlaceholder,
  addLabel,
  onForm,
  onAdd,
  onRename,
  onDelete,
}: {
  title: string;
  note: string;
  items: Item[];
  form: { email: string; name: string };
  loading: boolean;
  emailPlaceholder: string;
  namePlaceholder: string;
  addLabel: string;
  onForm: (next: { email: string; name: string }) => void;
  onAdd: () => void;
  onRename: (item: Item, name: string) => void;
  onDelete: (item: Item) => void;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-950/40">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{note}</p>
      <div className="mt-4 space-y-2">
        <input
          value={form.email}
          onChange={(e) => onForm({ ...form, email: e.target.value })}
          placeholder={emailPlaceholder}
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          value={form.name}
          onChange={(e) => onForm({ ...form, name: e.target.value })}
          placeholder={namePlaceholder}
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="button" onClick={onAdd} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
          {addLabel}
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-500">No entries yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="text-sm font-semibold">{item.email}</div>
              <input
                defaultValue={item.name || ""}
                onBlur={(e) => onRename(item, e.target.value)}
                placeholder="Name"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => onDelete(item)}
                className="mt-2 rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ApplicantCard({
  items,
  form,
  loading,
  onForm,
  onAdd,
  onPatch,
  onDelete,
}: {
  items: Item[];
  form: { email: string; name: string; approver_email: string };
  loading: boolean;
  onForm: (next: { email: string; name: string; approver_email: string }) => void;
  onAdd: () => void;
  onPatch: (item: Item, patch: { name?: string; approver_email?: string }) => void;
  onDelete: (item: Item) => void;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-950/40">
      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Leave apply from</h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        ID mail → employee name → approver mail. Approval goes to approver only (not global Approval list). ID mail
        never receives Approval/Notification list mail.
      </p>
      <div className="mt-4 space-y-2">
        <input
          value={form.email}
          onChange={(e) => onForm({ ...form, email: e.target.value })}
          placeholder="ea@industryprime.com"
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          value={form.name}
          onChange={(e) => onForm({ ...form, name: e.target.value })}
          placeholder="Souvik Das"
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <input
          value={form.approver_email}
          onChange={(e) => onForm({ ...form, approver_email: e.target.value })}
          placeholder="approver@industryprime.com"
          className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button type="button" onClick={onAdd} className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white">
          Add ID mail
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="text-sm text-zinc-500">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-500">No entries yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-zinc-200 p-2 dark:border-zinc-800">
              <div className="text-sm font-semibold">
                {item.email} <span className="font-normal text-zinc-500">→</span> {item.name || "—"}
              </div>
              <label className="mt-2 block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Approver</label>
              <input
                defaultValue={item.approver_email || ""}
                onBlur={(e) => onPatch(item, { approver_email: e.target.value.trim().toLowerCase() })}
                placeholder="approver@industryprime.com"
                className="mt-0.5 w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <input
                defaultValue={item.name || ""}
                onBlur={(e) => onPatch(item, { name: e.target.value })}
                placeholder="Souvik Das"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => onDelete(item)}
                className="mt-2 rounded-lg bg-rose-600 px-2 py-1 text-xs font-semibold text-white"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getStoredUser } from "@/lib/auth";

type Kind = "approval" | "notification" | "applicant";
type Item = { id: string; kind: Kind; email: string; name?: string | null };

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
  const [form, setForm] = useState<Record<Kind, { email: string; name: string }>>({
    approval: { email: "", name: "" },
    notification: { email: "", name: "" },
    applicant: { email: "", name: "" },
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
    const email = form[kind].email.trim().toLowerCase();
    const name = form[kind].name.trim();
    if (!isValidEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (kind === "applicant" && !name) {
      setError("Employee name is required (e.g. Souvik Das).");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      await apiFetch("/email-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, email, name: name || null }),
      });
      setForm((prev) => ({ ...prev, [kind]: { email: "", name: "" } }));
      setMessage("Email list updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add recipient");
    }
  }

  async function rename(item: Item, name: string) {
    try {
      await apiFetch(`/email-lists/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename");
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
          note="These addresses receive leave approval requests with Approve / Reject buttons."
          items={approval}
          form={form.approval}
          loading={loading}
          emailPlaceholder="email@company.com"
          namePlaceholder="Optional name"
          addLabel="Add recipient"
          onForm={(next) => setForm((prev) => ({ ...prev, approval: next }))}
          onAdd={() => void add("approval")}
          onRename={(item, name) => void rename(item, name)}
          onDelete={(item) => void remove(item)}
        />
        <Card
          title="Notification Recipients"
          note="These addresses are notified (FYI only) when a leave is applied."
          items={notification}
          form={form.notification}
          loading={loading}
          emailPlaceholder="email@company.com"
          namePlaceholder="Optional name"
          addLabel="Add recipient"
          onForm={(next) => setForm((prev) => ({ ...prev, notification: next }))}
          onAdd={() => void add("notification")}
          onRename={(item, name) => void rename(item, name)}
          onDelete={(item) => void remove(item)}
        />
        <Card
          title="Leave apply from"
          note="ID mail used when leave is applied. That address is notified on apply; approvers see email → employee name."
          items={applicant}
          form={form.applicant}
          loading={loading}
          emailPlaceholder="ea@industryprime.com"
          namePlaceholder="Souvik Das"
          addLabel="Add ID mail"
          showArrow
          nameRequired
          onForm={(next) => setForm((prev) => ({ ...prev, applicant: next }))}
          onAdd={() => void add("applicant")}
          onRename={(item, name) => void rename(item, name)}
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
  showArrow = false,
  nameRequired = false,
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
  showArrow?: boolean;
  nameRequired?: boolean;
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
          required={nameRequired}
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
              <div className="text-sm font-semibold">
                {showArrow ? (
                  <>
                    {item.email} <span className="font-normal text-zinc-500">→</span> {item.name || "—"}
                  </>
                ) : (
                  item.email
                )}
              </div>
              {!showArrow ? (
                <input
                  defaultValue={item.name || ""}
                  onBlur={(e) => onRename(item, e.target.value)}
                  placeholder="Name"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
              ) : (
                <input
                  defaultValue={item.name || ""}
                  onBlur={(e) => onRename(item, e.target.value)}
                  placeholder={namePlaceholder}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                />
              )}
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

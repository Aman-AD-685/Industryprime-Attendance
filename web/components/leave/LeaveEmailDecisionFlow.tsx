"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  fetchLeaveDecisionPreview,
  submitLeaveEmailApprove,
  submitLeaveEmailReject,
  type LeaveDecisionPreview,
} from "@/lib/leaveEmailDecision";

type Mode = "approve" | "reject";

type Phase = "loading" | "form" | "submitting" | "success" | "error" | "already" | "invalid";

const copy: Record<
  Mode,
  {
    title: string;
    remarksLabel: string;
    remarksPlaceholder: string;
    submit: string;
    submitting: string;
    successTitle: string;
    accent: string;
    button: string;
  }
> = {
  approve: {
    title: "Approve leave request",
    remarksLabel: "Why approve? (required)",
    remarksPlaceholder: "Briefly explain why this leave is approved",
    submit: "Approve",
    submitting: "Approving…",
    successTitle: "Leave approved",
    accent: "border-emerald-200 dark:border-emerald-900/40",
    button: "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500",
  },
  reject: {
    title: "Reject leave request",
    remarksLabel: "Rejection remarks (required)",
    remarksPlaceholder: "Explain why this leave cannot be approved",
    submit: "Reject",
    submitting: "Rejecting…",
    successTitle: "Leave rejected",
    accent: "border-rose-200 dark:border-rose-900/40",
    button: "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500",
  },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[70vh] bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-xl">{children}</div>
    </div>
  );
}

function Card({
  children,
  className = "",
  shake = false,
}: {
  children: React.ReactNode;
  className?: string;
  shake?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${shake ? "leave-decision-shake" : ""} ${className}`}
    >
      {children}
    </div>
  );
}

export function LeaveEmailDecisionFlow({ mode }: { mode: Mode }) {
  const search = useSearchParams();
  const leaveId = useMemo(() => (search.get("leave_id") || "").trim(), [search]);
  const token = useMemo(() => (search.get("token") || "").trim(), [search]);
  const text = copy[mode];

  const [preview, setPreview] = useState<LeaveDecisionPreview | null>(null);
  const [remarks, setRemarks] = useState("");
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setPhase("loading");
      setMessage(null);
      if (!leaveId || !token) {
        if (!cancelled) {
          setMessage("This link is missing required parameters.");
          setPhase("invalid");
        }
        return;
      }
      try {
        const data = await fetchLeaveDecisionPreview(leaveId, token);
        if (cancelled) return;
        if (data.action !== mode) {
          setMessage(
            mode === "approve"
              ? "This link is for rejection. Open the Reject button from your email."
              : "This link is for approval. Open the Approve button from your email.",
          );
          setPhase("invalid");
          return;
        }
        setPreview(data);
        if (data.already_decided) {
          setPhase("already");
        } else {
          setPhase("form");
        }
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : "Approval link expired or invalid");
          setPhase("error");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [leaveId, token, mode]);

  function triggerShake() {
    setShake(true);
    window.setTimeout(() => setShake(false), 400);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!remarks.trim()) {
      setMessage("Remarks are required before you can submit this decision.");
      triggerShake();
      return;
    }
    setPhase("submitting");
    setMessage(null);
    try {
      const result =
        mode === "approve"
          ? await submitLeaveEmailApprove(token, remarks)
          : await submitLeaveEmailReject(token, remarks);
      setMessage(result.message || (mode === "approve" ? "Leave approved successfully." : "Leave rejected."));
      setPhase("success");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not submit your decision");
      setPhase("form");
      triggerShake();
    }
  }

  if (phase === "loading") {
    return (
      <Shell>
        <Card>
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="h-10 w-10 animate-spin text-emerald-600" aria-hidden />
            <p className="text-sm text-zinc-600 dark:text-zinc-300">Validating your secure link…</p>
            <div className="h-2 w-full max-w-xs animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
          </div>
        </Card>
      </Shell>
    );
  }

  if (phase === "invalid" || phase === "error") {
    return (
      <Shell>
        <Card shake={shake} className="text-center">
          <XCircle className="mx-auto h-12 w-12 text-rose-600" aria-hidden />
          <h1 className="mt-4 text-lg font-semibold text-rose-800 dark:text-rose-200">
            {phase === "invalid" ? "Invalid link" : "Something went wrong"}
          </h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
          <p className="mt-4 text-xs text-zinc-500">Use the latest Approve or Reject link from your email.</p>
        </Card>
      </Shell>
    );
  }

  if (phase === "already") {
    return (
      <Shell>
        <Card className="text-center">
          <p className="text-lg font-semibold text-amber-900 dark:text-amber-100">Already processed</p>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            This leave request has already been decided.
          </p>
        </Card>
      </Shell>
    );
  }

  if (phase === "success") {
    return (
      <Shell>
        <Card className={`text-center ${text.accent} leave-decision-success-pop`}>
          <div className="leave-decision-check-pop mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/60">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" aria-hidden />
          </div>
          <h1 className="mt-5 text-xl font-bold text-zinc-900 dark:text-zinc-50">{text.successTitle}</h1>
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{message}</p>
          {mode === "reject" ? (
            <p className="mt-4 text-xs text-zinc-500">The employee has been notified by email.</p>
          ) : null}
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card shake={shake}>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">{text.title}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Dates: {preview?.request.leave_date_start || "—"} → {preview?.request.leave_date_end || "—"}
        </p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Type: {preview?.request.leave_type || "Leave"}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Reason: {preview?.request.reason || "—"}</p>

        {message ? (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
            {message}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {text.remarksLabel}
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={5}
              required
              minLength={1}
              disabled={phase === "submitting"}
              placeholder={text.remarksPlaceholder}
              className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </label>
          <button
            type="submit"
            disabled={phase === "submitting"}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 ${text.button}`}
          >
            {phase === "submitting" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {text.submitting}
              </>
            ) : (
              text.submit
            )}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-zinc-500">No login required — this link is only for you as approver.</p>
      </Card>
    </Shell>
  );
}

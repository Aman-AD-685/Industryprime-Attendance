"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, type AuthUser } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  pollAttendancePdfStatus,
  type PdfUploadStatusResponse,
  uploadAttendancePdfWithProgress,
} from "@/lib/uploadAttendancePdf";

function statusBadge(s: string) {
  if (s === "success") return "✅ Success";
  if (s === "unmapped") return "⚠️ Unmapped";
  return "❌ Failed";
}

function downloadErrorCsv(rows: PdfUploadStatusResponse["rows"]) {
  const bad = rows.filter((r) => r.status !== "success");
  const header = "row,emp_code,user,in,out,status\n";
  const body = bad
    .map(
      (r) =>
        `${r.row},"${String(r.emp_code).replace(/"/g, '""')}","${String(r.user).replace(/"/g, '""')}",${r.in},${r.out},${r.status}`,
    )
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "attendance-upload-errors.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function AttendancePdfUploadPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PdfUploadStatusResponse | null>(null);
  const [drag, setDrag] = useState(false);
  const [lastFile, setLastFile] = useState<File | null>(null);

  useEffect(() => {
    let m = true;
    (async () => {
      try {
        const u = await getCurrentUser();
        if (m) setUser(u);
      } catch {
        if (m) setUser(null);
      } finally {
        if (m) setLoadingSession(false);
      }
    })();
    return () => {
      m = false;
    };
  }, []);

  const pollUntilDone = useCallback(async (uploadId: string) => {
    for (let i = 0; i < 180; i++) {
      const st = await pollAttendancePdfStatus(uploadId);
      if (st.status === "completed" || st.status === "failed") {
        setResult(st);
        return;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setError("Timed out waiting for PDF processing.");
  }, []);

  const runUpload = useCallback(
    async (file: File, dryRunMode: boolean) => {
      setError(null);
      setResult(null);
      setProgress(0);
      setBusy(true);
      try {
        const { upload_id } = await uploadAttendancePdfWithProgress(file, {
          overwrite,
          dryRun: dryRunMode,
          onProgress: (loaded, total) => {
            if (total > 0) setProgress(Math.round((100 * loaded) / total));
          },
        });
        setProgress(100);
        await pollUntilDone(upload_id);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [overwrite, pollUntilDone],
  );

  const onFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (file.type !== "application/pdf") {
        setError("Please choose a PDF file.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("PDF must be at most 5MB.");
        return;
      }
      setLastFile(file);
      await runUpload(file, dryRun);
    },
    [dryRun, runUpload],
  );

  const saveDryRunToAttendance = useCallback(async () => {
    if (!lastFile) {
      setError("Choose a PDF first.");
      return;
    }
    await runUpload(lastFile, false);
  }, [lastFile, runUpload]);

  if (loadingSession) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Loading…
      </div>
    );
  }

  if (!user || (user.role !== "admin" && user.role !== "master_admin")) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-amber-200 bg-amber-50 px-6 py-8 dark:border-amber-900 dark:bg-amber-950/40">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Restricted</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Only admins can upload attendance PDFs. Use <strong>Add Attendance → Enter Atten.</strong> for manual
          entry.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        PDF attendance import
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        This tool is separate from the sidebar{" "}
        <Link href="/attendance" className="font-semibold text-emerald-700 underline-offset-4 hover:underline dark:text-emerald-300">
          Attendance
        </Link>{" "}
        list (employee month sheets). After a successful import, open an employee there to see updated IN/OUT for the report date.
      </p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Matching uses{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">employees.at_div_code</code> then{" "}
        <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">employee_code</code>. Daily PDFs often leave{" "}
        <strong>OUT</strong> blank—those rows import with <strong>IN only</strong> (same rules as manual entry).
      </p>

      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <label className="flex cursor-pointer items-center gap-2 font-medium text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
            className="rounded border-emerald-500"
          />
          Overwrite existing row for same employee + date
        </label>
        <label className="flex cursor-pointer items-center gap-2 font-medium text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="rounded border-emerald-500" />
          Dry run (parse only — no DB writes)
        </label>
      </div>

      <div
        className={cn(
          "relative mt-6 flex min-h-[200px] flex-col items-center justify-center rounded-3xl border-2 border-dashed px-4 py-10 transition",
          drag
            ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40"
            : "border-zinc-300 bg-white/70 dark:border-zinc-700 dark:bg-zinc-950/40",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          void onFile(e.dataTransfer.files?.[0] ?? null);
        }}
      >
        <input
          type="file"
          accept="application/pdf"
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={busy}
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        <p className="pointer-events-none text-center text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Drag & drop PDF here, or tap to browse
        </p>
        <p className="pointer-events-none mt-2 text-center text-xs text-zinc-500">Max 5MB · application/pdf only</p>
        {busy ? (
          <div className="pointer-events-none mt-6 w-full max-w-md">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-center text-xs text-zinc-500">{progress}% uploaded…</p>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-8 space-y-4">
          <div className="rounded-3xl border border-zinc-200 bg-white/80 p-5 dark:border-zinc-800 dark:bg-zinc-950/50">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Result</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-zinc-500">Total</dt>
                <dd className="font-semibold text-zinc-900 dark:text-zinc-100">{result.total}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Success</dt>
                <dd className="font-semibold text-emerald-700 dark:text-emerald-300">{result.success}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Failed</dt>
                <dd className="font-semibold text-red-700 dark:text-red-300">{result.failed}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Unmapped</dt>
                <dd className="font-semibold text-amber-700 dark:text-amber-300">{result.unmapped}</dd>
              </div>
            </dl>
            {result.duplicate_user_errors ? (
              <p className="mt-2 text-xs text-zinc-500">
                Duplicate user errors:{" "}
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{result.duplicate_user_errors}</span>
              </p>
            ) : null}
            {(result.failed > 0 || result.unmapped > 0) && result.rows?.length ? (
              <button
                type="button"
                className="mt-4 rounded-2xl border border-zinc-200 px-4 py-2 text-xs font-semibold hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                onClick={() => downloadErrorCsv(result.rows)}
              >
                Download error report (CSV)
              </button>
            ) : null}
            {result.dry_run ? (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveDryRunToAttendance()}
                  disabled={busy || !lastFile}
                  className="rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? "Saving..." : "Save to Attendance"}
                </button>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  After preview (dry run), click Save to write user-wise IN/OUT into Attendance.
                </p>
              </div>
            ) : null}
          </div>

          <div className="overflow-x-auto rounded-3xl border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100/80 dark:bg-zinc-900/80">
                <tr>
                  <th className="px-4 py-2 font-semibold">Row</th>
                  <th className="px-4 py-2 font-semibold">Emp code</th>
                  <th className="px-4 py-2 font-semibold">User</th>
                  <th className="px-4 py-2 font-semibold">IN</th>
                  <th className="px-4 py-2 font-semibold">OUT</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {(result.rows || []).map((r) => (
                  <tr key={r.row + "-" + r.emp_code} className="border-t border-zinc-100 dark:border-zinc-800">
                    <td className="px-4 py-2">{r.row}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.emp_code}</td>
                    <td className="px-4 py-2">{r.user}</td>
                    <td className="px-4 py-2">{r.in}</td>
                    <td className="px-4 py-2">{r.out}</td>
                    <td className="px-4 py-2">{statusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-emerald-200/80 bg-emerald-50/40 p-5 dark:border-emerald-900/60 dark:bg-emerald-950/25 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              {result.dry_run
                ? "Dry run: nothing was saved. Turn off “Dry run” to write attendance, then review it under Attendance."
                : result.success > 0
                  ? "Imported times are stored for the report date. Use Attendance → pick an employee → open that month to review the grid."
                  : "Fix errors or try another PDF, then import again."}
            </p>
            <Link
              href="/attendance"
              className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Open Attendance
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

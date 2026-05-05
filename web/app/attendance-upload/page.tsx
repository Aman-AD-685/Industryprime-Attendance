"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo, useState } from "react";
import {
  pollAttendancePdfStatus,
  type PdfUploadStatusResponse,
  uploadAttendancePdfWithProgress,
} from "@/lib/uploadAttendancePdf";
import { cn } from "@/lib/cn";

function statusBadge(s: string) {
  if (s === "success") return "✅ Success";
  if (s === "unmapped") return "⚠️ Unmapped";
  return "❌ Failed";
}

function PublicAttendanceUploadInner() {
  const search = useSearchParams();
  const token = useMemo(() => search.get("token")?.trim() || "", [search]);

  const [overwrite, setOverwrite] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PdfUploadStatusResponse | null>(null);
  const [drag, setDrag] = useState(false);

  const pollUntilDone = useCallback(
    async (uploadId: string, tok: string) => {
      for (let i = 0; i < 180; i++) {
        const st = await pollAttendancePdfStatus(uploadId, { token: tok });
        if (st.status === "completed" || st.status === "failed") {
          setResult(st);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setError("Timed out waiting for PDF processing.");
    },
    [],
  );

  const onFile = useCallback(
    async (file: File | null) => {
      setError(null);
      setResult(null);
      setProgress(0);
      if (!token) {
        setError("Missing token. Open this page with ?token=…");
        return;
      }
      if (!file) return;
      if (file.type !== "application/pdf") {
        setError("Please choose a PDF file.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("PDF must be at most 5MB.");
        return;
      }
      setBusy(true);
      try {
        const { upload_id } = await uploadAttendancePdfWithProgress(file, {
          overwrite,
          dryRun,
          token,
          onProgress: (loaded, total) => {
            if (total > 0) setProgress(Math.round((100 * loaded) / total));
          },
        });
        setProgress(100);
        await pollUntilDone(upload_id, token);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [dryRun, overwrite, pollUntilDone, token],
  );

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-4 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
        <div className="max-w-md rounded-3xl border border-zinc-200 bg-white/90 p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/90">
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Attendance PDF upload</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            This page requires a secure link with <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-900">token</code>{" "}
            in the query string. Ask your administrator for a valid URL.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-4 py-12 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Upload attendance (PDF)</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Token-protected upload. Only this form can import files with your link.
        </p>

        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <label className="flex cursor-pointer items-center gap-2 font-medium text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="rounded border-emerald-500"
            />
            Overwrite existing
          </label>
          <label className="flex cursor-pointer items-center gap-2 font-medium text-zinc-700 dark:text-zinc-300">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="rounded border-emerald-500" />
            Dry run
          </label>
        </div>

        <div
          className={cn(
            "relative mt-6 flex min-h-[200px] flex-col items-center justify-center rounded-3xl border-2 border-dashed px-4 py-10 transition",
            drag
              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/40"
              : "border-zinc-300 bg-white/80 dark:border-zinc-700 dark:bg-zinc-950/50",
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
            Drag & drop PDF, or tap to browse
          </p>
          {busy ? (
            <div className="pointer-events-none mt-6 w-full max-w-md">
              <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-2 text-center text-xs text-zinc-500">{progress}%</p>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="mt-8 overflow-x-auto rounded-3xl border border-zinc-200 bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/50">
            <div className="border-b border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
              <strong>Total</strong> {result.total} · <strong>OK</strong> {result.success} · <strong>Failed</strong>{" "}
              {result.failed} · <strong>Unmapped</strong> {result.unmapped}
            </div>
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-100/80 dark:bg-zinc-900/80">
                <tr>
                  <th className="px-4 py-2">Row</th>
                  <th className="px-4 py-2">Emp</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">IN</th>
                  <th className="px-4 py-2">OUT</th>
                  <th className="px-4 py-2">Status</th>
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
        ) : null}
      </div>
    </div>
  );
}

export default function PublicAttendanceUploadPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">Loading…</div>
      }
    >
      <PublicAttendanceUploadInner />
    </Suspense>
  );
}

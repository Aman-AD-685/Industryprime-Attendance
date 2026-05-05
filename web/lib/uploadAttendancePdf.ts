"use client";

import { getStoredToken } from "@/lib/auth";
import { effectiveApiBase } from "@/lib/envApi";

/** Same-origin `/api` when NEXT_PUBLIC routes through Next proxy. */
export function attendancePdfUploadUrl(path: string): string {
  const raw = effectiveApiBase();
  const base = raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export async function uploadAttendancePdfWithProgress(
  file: File,
  opts: {
    overwrite: boolean;
    dryRun: boolean;
    /** Public `/attendance/public/upload-pdf`; omit auth header when set */
    token?: string;
    onProgress?: (loaded: number, total: number) => void;
  },
): Promise<{ upload_id: string; status: string }> {
  const url = attendancePdfUploadUrl(
    opts.token != null ? "/attendance/public/upload-pdf" : "/attendance/upload-pdf",
  );
  const body = new FormData();
  body.append("file", file);
  body.append("overwrite", String(opts.overwrite));
  body.append("dry_run", String(opts.dryRun));
  if (opts.token != null) {
    body.append("token", opts.token);
  }

  const token = getStoredToken();
  return await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    if (token && opts.token == null) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && opts.onProgress) {
        opts.onProgress(ev.loaded, ev.total);
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText || "{}"));
        } catch {
          reject(new Error("Invalid JSON response"));
        }
      } else {
        reject(new Error(xhr.responseText || xhr.statusText || `HTTP ${xhr.status}`));
      }
    };
    xhr.send(body);
  });
}

export async function pollAttendancePdfStatus(
  uploadId: string,
  opts: { token?: string } = {},
): Promise<PdfUploadStatusResponse> {
  const qs =
    opts.token != null
      ? `?token=${encodeURIComponent(opts.token)}`
      : "";
  const path =
    opts.token != null
      ? `/attendance/public/upload-pdf/status/${uploadId}${qs}`
      : `/attendance/upload-pdf/status/${uploadId}`;
  const url = attendancePdfUploadUrl(path);
  const headers: HeadersInit = {};
  const auth = opts.token != null ? null : getStoredToken();
  if (auth) headers["Authorization"] = `Bearer ${auth}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || res.statusText);
  }
  return (await res.json()) as PdfUploadStatusResponse;
}

export type PdfUploadStatusResponse = {
  upload_id: string;
  status?: string | null;
  total: number;
  success: number;
  failed: number;
  unmapped: number;
  duplicate_user_errors?: number;
  errors: { row: number; reason: string }[];
  rows: {
    row: number;
    emp_code: string;
    user: string;
    in: string;
    out: string;
    status: string;
  }[];
  dry_run?: boolean;
  overwrite?: boolean;
  completed_at?: string | null;
};

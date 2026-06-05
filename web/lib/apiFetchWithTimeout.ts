/** Shared fetch timeout for API calls (avoids hung UI on slow/cold backends). */

export const DEFAULT_API_TIMEOUT_MS = 12_000;

/** Payroll summary aggregates attendance + leave for all employees — allow more time locally. */
export const PAYROLL_API_TIMEOUT_MS = 45_000;

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = DEFAULT_API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const id = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(id);
  }
}

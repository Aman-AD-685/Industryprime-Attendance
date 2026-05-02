/** Build query string for optional `ATTENDANCE_ENTRY_SECRET` (?key=). */
export function withEntryKey(path: string, key: string | null): string {
  if (!key) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}key=${encodeURIComponent(key)}`;
}

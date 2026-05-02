"use client";

export type MonthRow = {
  date: string;
  in_time?: string | null;
  out_time?: string | null;
  created_at?: string | null;
};

type Props = {
  rows: MonthRow[];
  loading?: boolean;
  title?: string;
  onEditRow?: (row: MonthRow) => void;
};

function dateCellValue(d: MonthRow["date"]): string {
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

export default function AttendanceEntryMonthTable({ rows, loading, title, onEditRow }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title || "Monthly entries"}
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">Excel-style view for the selected user</p>
      </div>
      <div className="max-h-[min(420px,50vh)] overflow-auto">
        <table className="w-full min-w-[320px] border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
            <tr>
              <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">Date</th>
              <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">IN</th>
              <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">OUT</th>
              {onEditRow ? (
                <th className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800 w-[1%]" />
              ) : null}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={onEditRow ? 4 : 3} className="px-4 py-10 text-center text-zinc-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={onEditRow ? 4 : 3} className="px-4 py-10 text-center text-zinc-500">
                  No entries for this month yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr
                  key={dateCellValue(r.date)}
                  className="border-b border-zinc-100 odd:bg-zinc-50/80 dark:border-zinc-800 dark:odd:bg-zinc-900/40"
                >
                  <td className="px-3 py-2 font-mono text-xs text-zinc-800 dark:text-zinc-200">
                    {dateCellValue(r.date)}
                  </td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.in_time || "—"}</td>
                  <td className="px-3 py-2 text-zinc-700 dark:text-zinc-300">{r.out_time || "—"}</td>
                  {onEditRow ? (
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => onEditRow(r)}
                        className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                      >
                        Edit
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

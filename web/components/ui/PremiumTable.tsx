"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export type TableColumn<T> = {
  key: string;
  title: string;
  widthClassName?: string;
  headerClassName?: string;
  cellClassName?: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
};

export function PremiumTable<T extends Record<string, any>>({
  columns,
  rows,
  initialSortKey,
  initialSortDir = "asc",
  pageSize = 10,
}: {
  columns: TableColumn<T>[];
  rows: T[];
  initialSortKey?: string;
  initialSortDir?: "asc" | "desc";
  pageSize?: number;
}) {
  const [sortKey, setSortKey] = useState<string | undefined>(initialSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialSortDir);
  const [page, setPage] = useState(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return rows;

    const factor = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = col.sortValue?.(a);
      const bv = col.sortValue?.(b);
      if (av == null && bv == null) return 0;
      if (av == null) return -1 * factor;
      if (bv == null) return 1 * factor;
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * factor;
      }
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [columns, rows, sortDir, sortKey]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  const onHeaderClick = (col: TableColumn<T>) => {
    if (!col.sortValue) return;
    if (sortKey !== col.key) {
      setSortKey(col.key);
      setSortDir("asc");
      setPage(1);
      return;
    }
    setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white/70 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/40">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/40">
            <tr>
              {columns.map((col) => {
                const active = col.key === sortKey;
                return (
                  <th
                    key={col.key}
                    className={cn(
                      "group px-4 py-3 font-semibold text-zinc-700 dark:text-zinc-200",
                      col.widthClassName,
                      col.headerClassName
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-2",
                        col.sortValue ? "cursor-pointer" : "cursor-default"
                      )}
                      onClick={() => onHeaderClick(col)}
                      aria-label={`Sort by ${col.title}`}
                    >
                      {col.title}
                      {active && col.sortValue && (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {sortDir === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                      {!active && col.sortValue && (
                        <span className="opacity-0 transition group-hover:opacity-100 text-zinc-400 dark:text-zinc-500">
                          ⇅
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {pageRows.map((row, idx) => (
              <tr key={idx} className="text-zinc-800 dark:text-zinc-200">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-4 py-2 align-middle", col.cellClassName)}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400">
                  No results
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          Showing <span className="font-semibold text-zinc-900 dark:text-zinc-100">{pageRows.length}</span> of{" "}
          <span className="font-semibold text-zinc-900 dark:text-zinc-100">{sorted.length}</span> rows
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="rounded-xl border border-zinc-200 bg-white/70 px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200"
          >
            Prev
          </button>
          <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
            Page {safePage} / {totalPages}
          </div>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="rounded-xl border border-zinc-200 bg-white/70 px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-200"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}


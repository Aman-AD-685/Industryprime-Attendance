"use client";

import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Avatar, Button, Card, CardHeader, CardTitle } from "@/components/ui/dashboard-ui";
import { formatLateMinutes } from "@/lib/admin/formatLate";
import type { LateArrival } from "@/lib/admin/dashboardMockStore";
import { useKpis, useLateArrivals, useNotifyLateMutation, useNotifyManyMutation } from "@/lib/hooks/useAdminDashboard";

export function DashboardLateArrivalsTable() {
  const lateQ = useLateArrivals(null);
  const kpisQ = useKpis();
  const notifyOne = useNotifyLateMutation();
  const notifyMany = useNotifyManyMutation();

  const [sorting, setSorting] = useState<SortingState>([{ id: "lateMinutes", desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });

  const data = lateQ.data ?? [];
  const totalLate = kpisQ.data?.late ?? 0;

  const columns = useMemo<ColumnDef<LateArrival>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[#E5EAE8] accent-[#10B981] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all on page"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[#E5EAE8] accent-[#10B981] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            aria-label={`Select ${row.original.name}`}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "name",
        header: "Employee",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Avatar className={row.original.avatarColor}>{initials(row.original.name)}</Avatar>
            <div>
              <div className="font-semibold text-[#0F1F1B]">{row.original.name}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#7A8784]">{row.original.empId}</div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "dept",
        header: ({ column }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            onClick={column.getToggleSortingHandler()}
          >
            Dept
            {column.getIsSorted() === "asc" ? " ↑" : column.getIsSorted() === "desc" ? " ↓" : ""}
          </button>
        ),
      },
      {
        accessorKey: "checkIn",
        header: ({ column }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            onClick={column.getToggleSortingHandler()}
          >
            Check-in
            {column.getIsSorted() === "asc" ? " ↑" : column.getIsSorted() === "desc" ? " ↓" : ""}
          </button>
        ),
      },
      {
        accessorKey: "lateMinutes",
        header: ({ column }) => (
          <button
            type="button"
            className="inline-flex items-center gap-1 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            onClick={column.getToggleSortingHandler()}
          >
            Late by
            {column.getIsSorted() === "asc" ? " ↑" : column.getIsSorted() === "desc" ? " ↓" : ""}
          </button>
        ),
        cell: ({ getValue }) => (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs font-semibold text-[#92400E]">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {formatLateMinutes(Number(getValue()))}
          </span>
        ),
      },
      {
        id: "action",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <button
            type="button"
            className="text-xs font-semibold text-emerald-600 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
            onClick={() =>
              void notifyOne.mutateAsync(row.original.id).then((res) => {
                if (res.ok && res.name) toast.success(`Reminder sent to ${res.name}`);
                else toast.message("Reminder sent (stub)");
              })
            }
          >
            Notify
          </button>
        ),
      },
    ],
    [notifyOne],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting, rowSelection, pagination },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: (r) => r.id,
    enableRowSelection: true,
  });

  const selected = table.getFilteredSelectedRowModel().rows.map((r) => r.original.id);

  if (!lateQ.isPending && data.length === 0) {
    return (
      <Card className="min-w-0 w-full lg:col-span-7">
        <CardHeader>
          <CardTitle>Late arrivals · today</CardTitle>
        </CardHeader>
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-[#7A8784]">
          <CheckCircle2 className="h-12 w-12 text-[#10B981]" aria-hidden />
          <p className="font-semibold text-[#0F1F1B]">Everyone&apos;s on time today</p>
        </div>
      </Card>
    );
  }

  const headerGroup = table.getHeaderGroups()[0];

  return (
    <Card className="min-w-0 w-full lg:col-span-7">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="mb-0">Late arrivals · today</CardTitle>
        {totalLate > 0 ? (
          <Link href="/attendance" className="text-xs font-semibold text-emerald-600 hover:underline">
            See all {totalLate} →
          </Link>
        ) : null}
      </div>

      {selected.length > 0 ? (
        <div className="sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">
          <span>{selected.length} selected</span>
          <Button
            className="h-8 px-3 py-1 text-xs"
            onClick={() =>
              void notifyMany.mutateAsync(selected).then((r) => {
                toast.success(`Sent reminders to ${r.count} employee(s)`);
                setRowSelection({});
              })
            }
          >
            Notify selected
          </Button>
          <Button variant="outline" className="h-8 px-3 py-1 text-xs" onClick={() => setRowSelection({})}>
            Clear
          </Button>
        </div>
      ) : null}

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="bg-[#F7FAF9] text-left text-[10px] font-bold uppercase tracking-wide text-[#7A8784]">
              {headerGroup?.headers.map((h) => (
                <th key={h.id} className="border-b border-[#E5EAE8] px-3 py-2">
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lateQ.isPending && lateQ.data === undefined ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-[#7A8784]">
                  Loading…
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b border-[#E5EAE8]/80">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#7A8784]">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="h-8 px-2 py-1 text-xs"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            className="h-8 px-2 py-1 text-xs"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3 md:hidden">
        {data.map((r) => (
          <div key={r.id} className="rounded-xl border border-[#E5EAE8] bg-[#F7FAF9] p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Avatar className={r.avatarColor}>{initials(r.name)}</Avatar>
                <div>
                  <p className="font-semibold text-[#0F1F1B]">{r.name}</p>
                  <p className="text-xs text-[#7A8784]">{r.empId}</p>
                </div>
              </div>
              <span className="rounded-full bg-[#FEF3C7] px-2 py-0.5 text-xs font-semibold text-[#92400E]">
                {formatLateMinutes(r.lateMinutes)}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#7A8784]">
              {r.dept} · Check-in <span className="font-bold text-[#0F1F1B]">{r.checkIn}</span>
            </p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-emerald-600 underline"
              onClick={() =>
                void notifyOne.mutateAsync(r.id).then((res) => {
                  if (res.ok && res.name) toast.success(`Reminder sent to ${res.name}`);
                })
              }
            >
              Notify
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

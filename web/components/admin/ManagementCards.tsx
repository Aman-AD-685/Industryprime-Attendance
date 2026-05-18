"use client";

import Link from "next/link";
import { Lock } from "lucide-react";

import { Tooltip } from "@/components/ui/dashboard-ui";

export function ManagementCards({ isMasterAdmin }: { isMasterAdmin: boolean }) {
  type Card = {
    title: string;
    chip: string;
    chipClass: string;
    desc: string;
    href: string;
    masterOnly?: boolean;
  };

  const cards: Card[] = [
    {
      title: "Attendance",
      chip: "Admin & Master Admin",
      chipClass: "bg-[#F7FAF9] text-[#7A8784]",
      desc: "Upload and review attendance reports.",
      href: "/attendance",
    },
    {
      title: "Employee Management",
      chip: "Admin & Master Admin",
      chipClass: "bg-[#F7FAF9] text-[#7A8784]",
      desc: "Manage employee records and directory data.",
      href: "/employees",
    },
    {
      title: "User & Role Control",
      chip: isMasterAdmin ? "Master Admin only" : "Master Admin only",
      chipClass: isMasterAdmin ? "bg-emerald-50 text-emerald-800" : "bg-[#F1F5F4] text-[#7A8784]",
      desc: "Manage users and role assignments.",
      href: "/dashboard/roles",
      masterOnly: true,
    },
  ];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => {
        const disabled = c.masterOnly && !isMasterAdmin;
        const inner = (
          <div
            className={`rounded-2xl border border-[#E5EAE8] bg-white p-6 shadow-sm ${
              disabled ? "pointer-events-none opacity-60" : "transition hover:-translate-y-0.5 hover:shadow-md"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base font-semibold text-[#0F1F1B]">{c.title}</h3>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${c.chipClass}`}>{c.chip}</span>
            </div>
            <p className="mt-3 text-sm text-[#7A8784]">{c.desc}</p>
            {disabled ? (
              <p className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-[#7A8784]">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Requires Master Admin role
              </p>
            ) : (
              <p className="mt-4 text-xs font-semibold text-[#10B981]">Open module →</p>
            )}
          </div>
        );

        if (disabled) {
          return (
            <Tooltip key={c.title} label="Requires Master Admin role">
              <div className="block w-full cursor-not-allowed text-left">{inner}</div>
            </Tooltip>
          );
        }

        return (
          <Link key={c.title} href={c.href} className="block text-left">
            {inner}
          </Link>
        );
      })}
    </div>
  );
}
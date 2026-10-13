"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useSession } from "@/lib/hooks/useSession";
import { can } from "@/lib/permissions";

export default function DashboardRolesPage() {
  const { user } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (user && !can.manageRoles(user.role)) {
      router.replace("/dashboard");
    }
  }, [router, user]);

  if (!user || !can.manageRoles(user.role)) {
    return (
      <div className="flex min-h-[30vh] items-center justify-center text-sm text-zinc-500">
        Checking access…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-zinc-900">User &amp; role control</h1>
      <p className="text-sm text-zinc-500">Master Admins manage roles on the Users page.</p>
      <Link href="/users" className="text-sm font-semibold text-emerald-500 underline">
        Open Users
      </Link>
    </div>
  );
}

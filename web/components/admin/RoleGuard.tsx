"use client";

import type { ReactNode } from "react";

import type { AuthUser } from "@/lib/auth";

type Allow = Array<NonNullable<AuthUser["role"]>>;

export function RoleGuard({
  allow,
  role,
  children,
  fallback,
}: {
  allow: Allow;
  role: AuthUser["role"] | null | undefined;
  children: ReactNode;
  fallback: ReactNode;
}) {
  if (!role || !allow.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}

export function UnauthorizedView() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <p className="text-sm font-semibold text-rose-500">Access denied</p>
      <h1 className="mt-2 text-xl font-semibold text-zinc-900">Admin dashboard</h1>
      <p className="mt-2 text-sm text-zinc-500">This area is only available to Admin and Master Admin accounts.</p>
    </div>
  );
}

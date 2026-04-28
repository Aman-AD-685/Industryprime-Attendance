"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getStoredUser,
  listUsers,
  updateUserRole,
  type AuthUser,
  type Role,
} from "@/lib/auth";
import { PremiumTable, type TableColumn } from "@/components/ui/PremiumTable";

const roleLabels: Record<Role, string> = {
  master_admin: "Master Admin",
  admin: "Admin",
  user: "User",
};

const roles: Role[] = ["master_admin", "admin", "user"];

export default function UsersPage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canEditRoles = currentUser?.role === "master_admin";

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const storedUser = getStoredUser();
    setCurrentUser(storedUser);
    if (storedUser?.role === "master_admin") {
      void loadUsers();
    } else {
      setLoading(false);
      setError("Only Master Admin can access User Management.");
    }
  }, []);

  async function onRoleChange(user: AuthUser, role: Role) {
    setSavingUserId(user.id);
    setError(null);
    setInfo(null);
    try {
      const updated = await updateUserRole(user.id, role);
      setUsers((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
      setInfo(`${updated.email} role changed to ${roleLabels[updated.role]}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSavingUserId(null);
    }
  }

  const columns = useMemo<TableColumn<AuthUser>[]>(
    () => [
      {
        key: "name",
        title: "Name",
        sortValue: (row) => row.name,
        render: (row) => (
          <div>
            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
              {row.name}
            </div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {row.id}
            </div>
          </div>
        ),
      },
      {
        key: "email",
        title: "Email",
        sortValue: (row) => row.email,
        render: (row) => <span>{row.email}</span>,
      },
      {
        key: "role",
        title: "Role",
        sortValue: (row) => row.role,
        render: (row) =>
          canEditRoles ? (
            <select
              value={row.role}
              disabled={savingUserId === row.id}
              onChange={(event) => void onRoleChange(row, event.target.value as Role)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 shadow-sm outline-none transition focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          ) : (
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
              {roleLabels[row.role]}
            </span>
          ),
      },
      {
        key: "created_at",
        title: "Created",
        sortValue: (row) => row.created_at ?? "",
        render: (row) => (
          <span className="text-zinc-600 dark:text-zinc-400">
            {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
          </span>
        ),
      },
    ],
    [canEditRoles, savingUserId]
  );

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200/70 bg-white/75 p-6 shadow-sm backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.20),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(6,182,212,0.16),transparent_40%)]" />
        <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
              IP Internal Management
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              User Management
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
              Signup users are created as User by default. Master Admin can promote
              or demote roles here; Admin can view users except Master Admin.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadUsers()}
            disabled={loading}
            className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh users"}
          </button>
        </div>
      </section>

      {info && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
          {info}
        </div>
      )}

      {error && (
        <div
          className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
          role="alert"
        >
          {error}
        </div>
      )}

      <PremiumTable
        columns={columns}
        rows={users}
        initialSortKey="created_at"
        initialSortDir="desc"
        pageSize={10}
      />
    </div>
  );
}

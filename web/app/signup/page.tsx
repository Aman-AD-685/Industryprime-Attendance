"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signup } from "@/lib/auth";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && email.trim().includes("@") && password.length >= 8;
  }, [email, name, password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      await signup(name.trim(), email.trim(), password);
      setInfo("Account created with User role. You can now login.");
      setTimeout(() => router.replace("/login"), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.24),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(6,182,212,0.18),transparent_40%)] px-4 py-10">
      <div className="absolute left-5 top-5 inline-flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-white shadow ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
        <Image
          src="/industryprime-logo.png"
          alt="Industryprime logo"
          width={56}
          height={56}
          className="h-full w-full object-contain"
        />
      </div>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow ring-1 ring-zinc-200 dark:bg-zinc-950 dark:ring-zinc-800">
                <Image
                  src="/industryprime-logo.png"
                  alt="Industryprime logo"
                  width={48}
                  height={48}
                  className="h-full w-full object-contain"
                />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                  Create account
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  Signup creates a User role only
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="rounded-2xl border border-zinc-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200"
            >
              Login
            </Link>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Aman Prime"
                autoComplete="name"
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/80 px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/80 px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                autoComplete="new-password"
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/80 px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100"
              />
            </div>

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

            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="h-11 w-full rounded-2xl bg-emerald-600 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Creating account..." : "Signup"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

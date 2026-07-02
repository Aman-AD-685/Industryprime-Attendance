"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { forgotPassword } from "@/lib/auth";
import { errorMessageForUser } from "@/lib/userFacingError";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const emailTrim = email.trim();
    if (!emailTrim.includes("@")) {
      setError("Enter a valid email address.");
      setInfo(null);
      return;
    }
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      setInfo(await forgotPassword(emailTrim));
    } catch (err) {
      setError(errorMessageForUser(err, "Could not send reset instructions. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_20%_10%,rgba(16,185,129,0.24),transparent_35%),radial-gradient(circle_at_80%_0%,rgba(6,182,212,0.18),transparent_40%)] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center justify-center">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200/70 bg-white/80 p-6 shadow-xl shadow-emerald-950/5 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/50">
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
                Forgot Password
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Send a secure reset link to your email.</p>
            </div>
          </div>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="forgot-email" className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Email
              </label>
              <input
                id="forgot-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white/80 px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-500 focus:border-emerald-500/60 focus:ring-4 focus:ring-emerald-500/10 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-100"
              />
            </div>

            {info ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">
                {info}
              </div>
            ) : null}

            {error ? (
              <div
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="h-11 w-full rounded-2xl bg-emerald-600 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sending reset link..." : "Send reset link"}
            </button>
          </form>

          <Link
            href="/login"
            className="mt-5 inline-flex text-xs font-semibold text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}

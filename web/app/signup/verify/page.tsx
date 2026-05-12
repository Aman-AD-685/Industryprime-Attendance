"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signupResend, signupVerify } from "@/lib/auth";

function parseEmail(raw: string | null): string {
  return (raw || "").trim().toLowerCase();
}

const SIGNUP_TICKET_KEY = "industryprime.signupTicket";

function SignupVerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = useMemo(() => parseEmail(searchParams.get("email")), [searchParams]);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [signupTicket, setSignupTicket] = useState<string | null>(null);

  useEffect(() => {
    try {
      setSignupTicket(sessionStorage.getItem(SIGNUP_TICKET_KEY));
    } catch {
      setSignupTicket(null);
    }
  }, []);

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  function setDigit(index: number, next: string) {
    const one = next.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const copy = [...prev];
      copy[index] = one;
      return copy;
    });
    if (one && inputs.current[index + 1]) {
      inputs.current[index + 1]?.focus();
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    const fill = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i += 1) fill[i] = pasted[i];
    setDigits(fill);
    const nextIndex = Math.min(pasted.length, 5);
    inputs.current[nextIndex]?.focus();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    const code = digits.join("");
    if (!email || !email.includes("@")) {
      setError("Missing signup email. Please start signup again.");
      return;
    }
    if (code.length !== 6) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    setLoading(true);
    try {
      await signupVerify(email, code, signupTicket ?? undefined);
      try {
        sessionStorage.removeItem(SIGNUP_TICKET_KEY);
      } catch {
        /* ignore */
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (!email || cooldown > 0) return;
    setResending(true);
    setError(null);
    setInfo(null);
    try {
      const res = await signupResend(email, signupTicket ?? undefined);
      if (res.signup_ticket) {
        try {
          sessionStorage.setItem(SIGNUP_TICKET_KEY, res.signup_ticket);
          setSignupTicket(res.signup_ticket);
        } catch {
          /* ignore */
        }
      }
      setInfo("A new code was sent.");
      setCooldown(60);
      const timer = window.setInterval(() => {
        setCooldown((n) => {
          if (n <= 1) {
            window.clearInterval(timer);
            return 0;
          }
          return n - 1;
        });
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="mx-auto mt-10 max-w-lg rounded-3xl border border-zinc-200 bg-white/80 p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Verify signup OTP</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        Enter the 6-digit code sent to <span className="font-semibold">{email || "your email"}</span>.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div className="flex items-center gap-2">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={d}
              onPaste={onPaste}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
              }}
              inputMode="numeric"
              maxLength={1}
              className="h-12 w-12 rounded-xl border border-zinc-300 text-center text-xl font-bold outline-none focus:border-emerald-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          ))}
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {info && <p className="text-sm text-emerald-600">{info}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-emerald-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Verifying..." : "Verify & Continue"}
        </button>
        <button
          type="button"
          disabled={resending || cooldown > 0}
          onClick={() => void onResend()}
          className="w-full rounded-2xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : resending ? "Sending..." : "Resend code"}
        </button>
      </form>
    </div>
  );
}

export default function SignupVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto mt-10 max-w-lg rounded-3xl border border-zinc-200 bg-white/80 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/40 dark:text-zinc-400">
          Loading…
        </div>
      }
    >
      <SignupVerifyContent />
    </Suspense>
  );
}
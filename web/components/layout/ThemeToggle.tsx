"use client";

import { useEffect, useMemo, useState } from "react";
import { IconMoon, IconSun } from "./icons";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") return saved;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")
    .matches;
  return prefersDark ? "dark" : "light";
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  const isDark = useMemo(() => theme === "dark", [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white/70 text-zinc-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200"
      aria-label="Toggle theme"
    >
      {isDark ? (
        <IconSun className="h-5 w-5" />
      ) : (
        <IconMoon className="h-5 w-5" />
      )}
    </button>
  );
}


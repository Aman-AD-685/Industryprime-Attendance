"use client";

import { useEffect, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-zinc-200/80 bg-white/90 p-6 shadow-sm backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/60", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold text-zinc-900 dark:text-zinc-50", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-xs text-zinc-500 dark:text-zinc-400", className)} {...props} />;
}

export function Button({
  className,
  variant = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "outline" | "ghost" | "destructive" }) {
  const v =
    variant === "outline"
      ? "border border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      : variant === "ghost"
        ? "text-zinc-900 hover:bg-zinc-100 dark:text-zinc-100 dark:hover:bg-zinc-800"
        : variant === "destructive"
          ? "bg-rose-600 text-white hover:bg-rose-700"
          : "bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800";
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        v,
        className,
      )}
      {...props}
    />
  );
}

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-semibold text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100",
        className,
      )}
      {...props}
    />
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800", className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Avatar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-zinc-900",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-800", className)} {...props} />;
}

export function Separator({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-px w-full bg-zinc-200 dark:bg-zinc-800", className)} role="separator" {...props} />;
}

export function Sheet({
  open,
  onOpenChange,
  side = "left",
  children,
  title,
  panelId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  side?: "left" | "right";
  children: ReactNode;
  title?: string;
  /** Optional id on the sliding panel (e.g. for aria-controls). */
  panelId?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label={title ?? "Panel"}>
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close menu"
        onClick={() => onOpenChange(false)}
      />
      <div
        id={panelId}
        className={cn(
          "absolute top-0 flex h-full max-h-screen min-h-0 w-[min(100%,280px)] flex-col bg-white shadow-xl dark:bg-zinc-950",
          side === "left" ? "left-0 border-r border-zinc-200" : "right-0 border-l border-zinc-200",
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Tabs({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <div data-tabs-value={value} data-on-change={onValueChange as unknown as string}>
      {children}
    </div>
  );
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("inline-flex flex-wrap gap-1 rounded-xl border border-zinc-200/80 bg-zinc-100/80 p-1 dark:border-zinc-800 dark:bg-zinc-900", className)} {...props} />;
}

export function TabsTrigger({
  value,
  current,
  onClick,
  className,
  ...props
}: HTMLAttributes<HTMLButtonElement> & { value: string; current: string }) {
  const active = value === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
        active ? "bg-white text-emerald-700 shadow-sm ring-1 ring-zinc-200/80 dark:bg-zinc-800 dark:text-emerald-300 dark:ring-zinc-700" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
        className,
      )}
      {...props}
    />
  );
}

export function Tooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="inline-flex" title={label}>
      {children}
    </span>
  );
}

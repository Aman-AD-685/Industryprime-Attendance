"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { setupAuthSessionMaintenance } from "@/lib/auth";

/** FMS-style session maintenance: proactive refresh every 50 min + on tab focus. */
export function AuthProvider({ children }: { children: ReactNode }) {
  useEffect(() => setupAuthSessionMaintenance(), []);
  return <>{children}</>;
}

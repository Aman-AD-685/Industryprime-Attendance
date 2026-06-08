"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { fetchMeProfile } from "@/lib/api/me";
import { getStoredUser, type AuthUser } from "@/lib/auth";

export type SessionUser = Pick<AuthUser, "id" | "name" | "email" | "role"> & {
  shift?: string | null;
  location?: string | null;
  joinedAt?: string | null;
};

function readSessionUser(): Pick<AuthUser, "id" | "name" | "email" | "role"> | null {
  const u = getStoredUser();
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

export function useSession(): { user: SessionUser | null } {
  const [user, setUser] = useState<Pick<AuthUser, "id" | "name" | "email" | "role"> | null>(() =>
    typeof window === "undefined" ? null : readSessionUser(),
  );

  const sync = useCallback(() => {
    setUser(readSessionUser());
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("industryprime-auth-change", sync);
    return () => window.removeEventListener("industryprime-auth-change", sync);
  }, [sync]);

  const profileQ = useQuery({
    queryKey: ["me-profile", user?.id],
    queryFn: fetchMeProfile,
    enabled: !!user && user.role === "user",
    staleTime: 300_000,
  });

  if (!user) return { user: null };
  if (user.role !== "user") {
    return { user: { ...user, shift: null, location: null, joinedAt: null } };
  }
  return {
    user: {
      ...user,
      shift: profileQ.data?.shift ?? null,
      location: profileQ.data?.location ?? null,
      joinedAt: profileQ.data?.joinedAt ?? null,
    },
  };
}

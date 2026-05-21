"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchMeDashboard,
  mergeDashboardWithOverlay,
  postMeNote,
  todayKey,
  writeTodayOverlay,
  type MeDashboard,
  type TodayOverlay,
} from "@/lib/api/me";

function toOverlay(t: MeDashboard["today"]): TodayOverlay {
  return {
    date: todayKey(),
    status: t.status,
    checkInAt: t.checkInAt,
    checkOutAt: t.checkOutAt,
    minutesWorked: t.minutesWorked,
    note: t.note,
  };
}

export function useMeDashboard() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["me-dashboard"],
    queryFn: async () => mergeDashboardWithOverlay(await fetchMeDashboard()),
    staleTime: 120_000,
  });

  const saveNote = useMutation({
    mutationFn: (note: string) => postMeNote({ note }),
    onSuccess: async (res) => {
      const cur = qc.getQueryData<MeDashboard>(["me-dashboard"]);
      const merged = cur ? mergeDashboardWithOverlay(cur) : null;
      if (merged?.today) {
        writeTodayOverlay({ ...toOverlay(merged.today), note: res.note });
      }
      await qc.invalidateQueries({ queryKey: ["me-dashboard"] });
    },
  });

  return { ...q, saveNote };
}

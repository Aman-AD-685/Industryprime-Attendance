"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  decideLeave,
  getAudit,
  getDepartments,
  getKpis,
  getLateArrivals,
  getPendingLeaves,
  getTrend,
  notifyEmployee,
  notifyEmployees,
  restoreLastLeave,
} from "@/lib/api/admin";

export const adminDashboardKeys = {
  all: ["admin"] as const,
  kpis: () => [...adminDashboardKeys.all, "kpis"] as const,
  trend: (r: "14d" | "30d") => [...adminDashboardKeys.all, "trend", r] as const,
  departments: () => [...adminDashboardKeys.all, "departments"] as const,
  late: (f: string | null) => [...adminDashboardKeys.all, "late", f ?? "all"] as const,
  leaves: () => [...adminDashboardKeys.all, "leaves"] as const,
  audit: (limit: number) => [...adminDashboardKeys.all, "audit", limit] as const,
};

const dashboardQueryDefaults = {
  staleTime: 120_000,
  gcTime: 10 * 60_000,
  refetchOnWindowFocus: false,
} as const;

export function useKpis() {
  return useQuery({
    queryKey: adminDashboardKeys.kpis(),
    queryFn: getKpis,
    ...dashboardQueryDefaults,
  });
}

export function useTrend(range: "14d" | "30d") {
  return useQuery({
    queryKey: adminDashboardKeys.trend(range),
    queryFn: () => getTrend(range),
    ...dashboardQueryDefaults,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: adminDashboardKeys.departments(),
    queryFn: getDepartments,
    ...dashboardQueryDefaults,
  });
}

export function useLateArrivals(filter: string | null) {
  return useQuery({
    queryKey: adminDashboardKeys.late(filter),
    queryFn: () => getLateArrivals(filter ?? undefined),
    ...dashboardQueryDefaults,
  });
}

export function usePendingLeaves() {
  return useQuery({
    queryKey: adminDashboardKeys.leaves(),
    queryFn: getPendingLeaves,
    ...dashboardQueryDefaults,
  });
}

export function useAudit(limit = 20) {
  return useQuery({
    queryKey: adminDashboardKeys.audit(limit),
    queryFn: () => getAudit(limit),
    ...dashboardQueryDefaults,
  });
}

export function useInvalidateAdminDashboard() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: adminDashboardKeys.all });
}

export function useNotifyLateMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notifyEmployee(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminDashboardKeys.all });
    },
  });
}

export function useNotifyManyMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => notifyEmployees(ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminDashboardKeys.all });
    },
  });
}

export function useLeaveDecisionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) => decideLeave(id, decision),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminDashboardKeys.all });
    },
  });
}

export function useLeaveUndoMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => restoreLastLeave(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: adminDashboardKeys.all });
    },
  });
}

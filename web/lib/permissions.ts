import type { AuthUser } from "@/lib/auth";

export type Role = AuthUser["role"];

export type AdminRole = "admin" | "master_admin";

export function isAdminRole(role: string): role is AdminRole {
  return role === "admin" || role === "master_admin";
}

export function isMasterAdmin(role: string): boolean {
  return role === "master_admin";
}

export const can = {
  seeAuditLog: (r: Role) => r === "master_admin",
  manageRoles: (r: Role) => r === "master_admin",
  deleteEmployee: (r: Role) => r === "master_admin",
  exportPayroll: (r: Role) => r === "master_admin",
  approveLeave: (r: Role) => r === "admin" || r === "master_admin",
  uploadPdf: (r: Role) => r === "admin" || r === "master_admin",
  viewPayslip: (r: Role) => r === "admin" || r === "master_admin",
};

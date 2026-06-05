import { NextResponse, type NextRequest } from "next/server";

import { isLeaveEmailPublicPath } from "@/lib/leaveEmailPublicPaths";

const AUTH_COOKIE = "industryprime_token";
/** Paths reachable without a session cookie (includes public attendance entry). */
const publicUnauthenticatedRoutes = new Set(["/login", "/signup", "/attendance-entry", "/attendance-upload"]);
/** Logged-in users are redirected away from these (not from `/attendance-entry`). */
const redirectIfAuthedRoutes = new Set(["/login", "/signup"]);

function isPublicUnauthenticatedPath(pathname: string): boolean {
  if (publicUnauthenticatedRoutes.has(pathname)) return true;
  if (pathname.startsWith("/signup/verify")) return true;
  /** Email approve/reject links — token auth only, no app login. */
  if (isLeaveEmailPublicPath(pathname)) return true;
  return false;
}

function dashboardPathForJwtRole(role: string | null | undefined): string {
  if (role === "user") return "/dashboard/user";
  if (role === "admin" || role === "master_admin") return "/dashboard";
  return "/dashboard";
}

/** Read role claim from JWT payload (no signature verify — routing hint only). */
function roleFromAuthToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    const payload = JSON.parse(json) as { role?: string };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!token && !isPublicUnauthenticatedPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token && redirectIfAuthedRoutes.has(pathname)) {
    const dest = dashboardPathForJwtRole(roleFromAuthToken(token));
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard",
    "/dashboard/:path*",
    "/users",
    "/users/:path*",
    "/employees",
    "/employees/:path*",
    "/attendance",
    "/attendance/:path*",
    "/attendance-upload",
    "/attendance-entry",
    "/leave",
    "/leave/:path*",
    "/leaves",
    "/leaves/:path*",
    "/payroll",
    "/payroll/:path*",
    "/reports",
    "/reports/:path*",
    "/settings",
    "/settings/:path*",
    "/login",
    "/signup",
  ],
};

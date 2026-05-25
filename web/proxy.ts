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
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dashboard/:path*",
    "/users/:path*",
    "/employees/:path*",
    "/attendance/:path*",
    "/attendance-upload",
    "/attendance-entry",
    "/leave/:path*",
    "/leaves/:path*",
    "/payroll/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/login",
    "/signup",
  ],
};

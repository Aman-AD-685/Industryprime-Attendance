import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "industryprime_token";
/** Paths reachable without a session cookie (includes public attendance entry). */
const publicUnauthenticatedRoutes = new Set(["/login", "/signup", "/attendance-entry", "/attendance-upload"]);
/** Logged-in users are redirected away from these (not from `/attendance-entry`). */
const redirectIfAuthedRoutes = new Set(["/login", "/signup"]);

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!token && !publicUnauthenticatedRoutes.has(pathname)) {
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
    "/payroll/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/login",
    "/signup",
  ],
};

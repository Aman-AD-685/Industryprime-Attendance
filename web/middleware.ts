import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "industryprime_token";
const publicRoutes = new Set(["/login", "/signup"]);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;

  if (pathname === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!token && !publicRoutes.has(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token && publicRoutes.has(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/users/:path*", "/employees/:path*", "/attendance/:path*", "/leave/:path*", "/payroll/:path*", "/reports/:path*", "/settings/:path*", "/login", "/signup"],
};

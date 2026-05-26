import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    if (
      (pathname.startsWith("/admin") || pathname.startsWith("/terminal")) &&
      token?.role !== "admin"
    ) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  },
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/admin/:path*",
    "/logs/:path*",
    "/profile/:path*",
    "/settings/:path*",
    "/terminal/:path*",
  ],
};

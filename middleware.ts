import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    const requiresTeamContext =
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/logs") ||
      pathname.startsWith("/admin") ||
      pathname.startsWith("/profile") ||
      pathname.startsWith("/terminal");

    if (requiresTeamContext && !token?.activeTeamId) {
      return NextResponse.redirect(
        new URL("/settings/team?next=" + encodeURIComponent(pathname), req.url),
      );
    }

    // The /terminal guard used to live here as `token?.role !== "admin"` — but
    // that reads the system role (User.role: admin | staff), snapshotted into
    // the JWT at sign-in, while POST /api/terminal/scan uses the team role via
    // `requireTeamPermission("terminal.scan")` (manager+). The two vocabularies
    // disagree, and worse: every self-signup team owner (default `staff`) was
    // locked out of their own kiosk by middleware but could POST to the API.
    // Guarding the page belongs at app/terminal/layout.tsx, where a DB read
    // can check the team role authoritatively.
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

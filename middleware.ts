import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/** Codes the login form renders as inline explanations. */
export type SessionRedirectReason =
  | "session_expired"
  | "session_revoked"
  | "signed_out_others";

const NEXTAUTH_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;

function loginUrl(req: NextRequest, reason: SessionRedirectReason | null) {
  const url = new URL("/login", req.url);
  url.searchParams.set(
    "next",
    req.nextUrl.pathname + (req.nextUrl.search || ""),
  );
  if (reason) url.searchParams.set("reason", reason);
  return url;
}

/**
 * The redirect that catches an expired or revoked session used to land on a
 * blank `/login` — the caller couldn't tell whether their session died, they
 * pressed the button themselves, or they were never signed in. This middleware
 * distinguishes those cases and appends `?reason=` so `LoginForm` can render a
 * matching notice.
 *
 * Team-scoped surfaces (dashboard, logs, admin, profile, terminal) additionally
 * require `activeTeamId`; that redirect stays where it was and keeps its own
 * `TeamAccessRedirectReason` machinery on `/settings/team`.
 */
export default async function middleware(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // No usable session on a protected route → bounce to login.
  const hasIdentity = !!(token as { id?: unknown } | null)?.id;
  if (!hasIdentity) {
    // Distinguish "the cookie exists but the token is empty" (the jwt callback
    // returned `{}` because sessionsVersion bumped or the JTI was revoked)
    // from "there is no cookie at all" (a first-time visitor). The former
    // deserves an explanation; the latter is business as usual.
    const cookieName = NEXTAUTH_COOKIE_NAMES.find((n) => req.cookies.has(n));
    const reason: SessionRedirectReason | null = cookieName
      ? "session_expired"
      : null;
    return NextResponse.redirect(loginUrl(req, reason));
  }

  const pathname = req.nextUrl.pathname;
  const requiresTeamContext =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/logs") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/terminal");

  if (
    requiresTeamContext &&
    !(token as { activeTeamId?: string | null } | null)?.activeTeamId
  ) {
    return NextResponse.redirect(
      new URL(
        "/settings/team?next=" + encodeURIComponent(pathname),
        req.url,
      ),
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
}

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

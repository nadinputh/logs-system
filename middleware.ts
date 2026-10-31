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
async function guard(req: NextRequest): Promise<NextResponse | null> {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // No usable session on a protected route → bounce to login.
  const hasIdentity = !!(token as { id?: unknown } | null)?.id;
  if (!hasIdentity) {
    // Distinguish "the cookie exists but the token is empty" from "there is no
    // cookie at all" (a first-time visitor). NOTE: getToken() only decodes the
    // JWT; it does not run the jwt callback, so a revoked session still passes
    // here. Revocation is enforced where data is read: every API route and
    // server page goes through getServerSession / requireTeamAccess.
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
  return null;
}

const PROTECTED = [
  "/dashboard",
  "/admin",
  "/logs",
  "/profile",
  "/settings",
  "/terminal",
  "/kiosk",
];

function buildCsp(nonce: string) {
  const dev = process.env.NODE_ENV !== "production";
  return [
    "default-src 'self'",
    // Per-request nonce: only scripts Next itself emitted run, so an injected
    // inline <script> or a third-party origin is refused. 'strict-dynamic'
    // lets those trusted scripts load their own chunks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // https: was too broad (image requests are an exfiltration channel); the
    // only third-party images are the OpenStreetMap tiles in the geofence picker.
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Runs on every page (not /api or static assets): mints the CSP nonce, then
 * applies the session guard to the protected prefixes. Next reads the nonce
 * from the request's CSP header and stamps it onto its own scripts; the layout
 * reads `x-nonce` for next-themes' inline script.
 */
export default async function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  const path = req.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));
  const blocked = isProtected ? await guard(req) : null;
  if (blocked) {
    blocked.headers.set("Content-Security-Policy", csp);
    return blocked;
  }

  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|fonts|sw.js|manifest.json).*)",
  ],
};

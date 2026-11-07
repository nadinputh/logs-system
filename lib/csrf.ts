import { NextResponse } from "next/server";

/**
 * Cross-origin rejection for state-changing requests.
 *
 * NextAuth's own routes ship the double-submit CSRF cookie, but nothing else
 * did — the app relied on `sameSite=lax`, which historically permitted
 * top-level POST navigations in some browsers. Checking `Origin` (with
 * `Referer` as a fallback) closes that gap without a token-shuffling dance,
 * and costs nothing in dev because curl/tests generally send neither.
 *
 * Rules:
 * - `Origin` present and matches the app's own origin → allow
 * - `Origin` present and mismatches → 403 (browser confirmed cross-origin)
 * - `Origin` absent, `Referer` present → same match rule
 * - Both absent (server-to-server, curl, most tests) → allow. Anything with a
 *   session cookie and no `Origin` from a real browser doesn't exist; a
 *   scripted attacker chooses not to send one, which is why the cookie is
 *   `sameSite=lax` in the first place.
 */
export function assertSameOrigin(req: Request): NextResponse | null {
  // Fetch Metadata: a browser sets this itself and page script cannot forge or
  // strip it, so it still protects the cases the Origin/Referer fallback below
  // lets through (a request with neither header, e.g. a cross-site navigation
  // to a GET with side effects, or a Referrer-Policy: no-referrer page).
  // `same-site` is a sibling subdomain, not this app: refuse it too.
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") {
    return NextResponse.json(
      { error: "Cross-origin request rejected" },
      { status: 403 },
    );
  }

  const header = req.headers.get("origin") ?? req.headers.get("referer");
  if (!header) return null;

  const expected =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    `http://localhost:${process.env.PORT ?? "4000"}`;

  let claimed: string;
  let approved: string;
  try {
    claimed = new URL(header).origin;
    approved = new URL(expected).origin;
  } catch {
    return NextResponse.json(
      { error: "Malformed request origin" },
      { status: 400 },
    );
  }

  if (claimed !== approved) {
    return NextResponse.json(
      { error: "Cross-origin request rejected" },
      { status: 403 },
    );
  }
  return null;
}

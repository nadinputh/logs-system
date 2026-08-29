import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, bumpSessionsVersion } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Invalidates every JWT issued to this user other than the caller's.
 *
 * Bumping User.sessionsVersion invalidates every live token for this user —
 * including the caller's — so the client re-signs immediately after using its
 * still-valid current cookie to hit this endpoint. That "call, then re-mint"
 * dance is the only way JWT-strategy sessions can revoke.
 *
 * Downstream: readSessionVersionCached picks up the new value within
 * SV_CACHE_TTL_MS (60s), bumpSessionsVersion also drops the inventory rows,
 * and every other device's next request returns to /login.
 *
 * Rate-limited because the underlying `$inc` writes to the User document; an
 * unbounded loop here would add write pressure the caller has no legitimate
 * reason to generate.
 */
export async function POST(req: Request) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const verdict = rateLimit(clientKey(req, "signout-others"), 5, 60_000);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a moment." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
    );
  }
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = (session.user as any).id as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sessionsVersion = await bumpSessionsVersion(userId);
  return NextResponse.json({ ok: true, sessionsVersion });
}

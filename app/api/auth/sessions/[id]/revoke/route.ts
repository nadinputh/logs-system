import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions, forgetJtiCache } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { connectDB } from "@/lib/db";
import { SessionInventory } from "@/lib/models/SessionInventory";
import { rateLimit, clientKey } from "@/lib/rateLimit";

export const runtime = "nodejs";

/**
 * Revokes one session row.
 *
 * Refuses to revoke the caller's own row — that would leave the user staring
 * at a settings page with a soon-to-be-invalid cookie and no explicit path
 * back to `/login?reason=signed_out_others`. The "sign out this device" path
 * is a plain `signOut()` from the caller; this endpoint is for the *others*.
 *
 * Rate-limited per IP so a compromised cookie cannot walk the whole
 * inventory in a tight loop.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;

  const verdict = rateLimit(clientKey(req, "session-revoke"), 30, 60_000);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many revocations. Try again in a moment." },
      { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
    );
  }

  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const currentJti = (session?.user as any)?.sid as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  await connectDB();
  const row = await SessionInventory.findOne({ _id: id, userId }).lean<{
    _id: Types.ObjectId;
    jti: string;
  } | null>();
  if (!row) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (currentJti && row.jti === currentJti) {
    return NextResponse.json(
      { error: "Cannot revoke the current session — use sign out instead." },
      { status: 400 },
    );
  }

  await SessionInventory.deleteOne({ _id: row._id });
  forgetJtiCache(row.jti);

  return NextResponse.json({ ok: true });
}

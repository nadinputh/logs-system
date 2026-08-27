import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { VerificationToken } from "@/lib/models/VerificationToken";
import { hashToken } from "@/lib/verification";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { token } = await req.json().catch(() => ({}));
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  await connectDB();

  const doc = await VerificationToken.findOne({
    token: hashToken(token),
    type: "email_verify",
    expiresAt: { $gt: new Date() },
  });

  if (!doc) {
    return NextResponse.json(
      { code: "INVALID_TOKEN", error: "This link is invalid or has expired." },
      { status: 400 },
    );
  }

  // Already redeemed. This is the ordinary case for a refreshed tab or a
  // double-fired effect, not a failure — the user's email *is* verified, and
  // telling them the link expired sends them looking for a problem that does
  // not exist.
  if (doc.consumedAt) {
    return NextResponse.json({ ok: true, already: true });
  }

  // Claim the token atomically. Two requests racing (StrictMode fires this
  // effect twice) must not both count as the redeemer.
  const claimed = await VerificationToken.findOneAndUpdate(
    { _id: doc._id, consumedAt: null },
    { consumedAt: new Date() },
  );
  if (!claimed) {
    return NextResponse.json({ ok: true, already: true });
  }

  await User.updateOne({ _id: doc.userId }, { emailVerified: new Date() });

  return NextResponse.json({ ok: true });
}

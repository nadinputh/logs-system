import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { VerificationToken } from "@/lib/models/VerificationToken";
import { hashToken } from "@/lib/verification";
import { bumpSessionsVersion } from "@/lib/auth";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

/**
 * Non-consuming validation, mirroring GET on set-password. Without this the
 * reset page accepts a password and a confirmation before revealing the link
 * is dead — the same trap the set-password page used to have.
 *
 * Reveals only validity and the address the link was issued to, which the
 * holder of the link already knows.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ valid: false }, { status: 400 });
  }

  await connectDB();

  const doc = await VerificationToken.findOne({
    token: hashToken(token),
    type: "password_reset",
    expiresAt: { $gt: new Date() },
    consumedAt: null,
  })
    .select("email expiresAt")
    .lean<any>();

  if (!doc) {
    return NextResponse.json(
      {
        valid: false,
        code: "INVALID_TOKEN",
        error: "This link is invalid or has expired.",
      },
      { status: 404 },
    );
  }

  return NextResponse.json({
    valid: true,
    email: doc.email,
    expiresAt: doc.expiresAt,
  });
}

// Consumes a password_reset token: replaces the password on an already-
// verified account.
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();

  const doc = await VerificationToken.findOne({
    token: hashToken(parsed.data.token),
    type: "password_reset",
    expiresAt: { $gt: new Date() },
    consumedAt: null,
  });
  if (!doc) {
    return NextResponse.json(
      { code: "INVALID_TOKEN", error: "This link is invalid or has expired." },
      { status: 400 },
    );
  }

  // Claim atomically before writing, so two submissions of the same link
  // cannot both flip the password.
  const claimed = await VerificationToken.findOneAndUpdate(
    { _id: doc._id, consumedAt: null },
    { consumedAt: new Date() },
  );
  if (!claimed) {
    return NextResponse.json(
      { code: "INVALID_TOKEN", error: "This link has already been used." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await User.updateOne({ _id: doc.userId }, { passwordHash });
  /**
   * Route the sessions-version bump through the shared helper so the local
   * cache is primed with the new value. `$inc`-ing directly here would leave
   * the process serving the reset with a stale cached `sv` for up to the
   * 60-second cache TTL — precisely the process where the tightest window
   * matters.
   */
  await bumpSessionsVersion(String(doc.userId));

  return NextResponse.json({ ok: true, email: doc.email });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { VerificationToken } from "@/lib/models/VerificationToken";
import { hashToken } from "@/lib/verification";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

/**
 * Reports whether a set-password link is still usable, without consuming it.
 *
 * The page used to render its form unconditionally, so a recipient whose link
 * had expired chose a password, confirmed it, submitted, and only then learned
 * the link was dead — with no way forward. The invite page has validated on
 * mount all along; this brings the higher-stakes flow up to the same bar.
 *
 * It reveals only validity and the address the link was issued to, which the
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
    type: "set_password",
    expiresAt: { $gt: new Date() },
    consumedAt: null,
  })
    .select("email expiresAt")
    .lean<any>();

  if (!doc) {
    return NextResponse.json(
      { valid: false, code: "INVALID_TOKEN", error: "This link is invalid or has expired." },
      { status: 404 },
    );
  }

  return NextResponse.json({ valid: true, email: doc.email, expiresAt: doc.expiresAt });
}

// Consumes a set_password token: sets the password AND verifies the email.
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();

  const doc = await VerificationToken.findOne({
    token: hashToken(parsed.data.token),
    type: "set_password",
    expiresAt: { $gt: new Date() },
    consumedAt: null,
  });
  if (!doc) {
    return NextResponse.json(
      { code: "INVALID_TOKEN", error: "This link is invalid or has expired." },
      { status: 400 },
    );
  }

  // Claim before writing, so two submissions of the same link cannot both set
  // a password.
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
  await User.updateOne(
    { _id: doc.userId },
    { passwordHash, emailVerified: new Date() },
  );

  return NextResponse.json({ ok: true, email: doc.email });
}

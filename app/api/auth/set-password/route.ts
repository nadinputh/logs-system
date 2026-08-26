import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { VerificationToken } from "@/lib/models/VerificationToken";
import { hashToken } from "@/lib/verification";

export const runtime = "nodejs";

const Schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

// Consumes a set_password token: sets the password AND verifies the email.
export async function POST(req: NextRequest) {
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

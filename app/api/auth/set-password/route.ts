import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { VerificationToken } from "@/lib/models/VerificationToken";

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
    token: parsed.data.token,
    type: "set_password",
    expiresAt: { $gt: new Date() },
  });
  if (!doc) {
    return NextResponse.json(
      { code: "INVALID_TOKEN", error: "This link is invalid or has expired." },
      { status: 400 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await User.updateOne(
    { _id: doc.userId },
    { passwordHash, emailVerified: new Date() },
  );
  await VerificationToken.deleteOne({ _id: doc._id });

  return NextResponse.json({ ok: true, email: doc.email });
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { VerificationToken } from "@/lib/models/VerificationToken";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  if (!token) {
    return NextResponse.json({ error: "Token required" }, { status: 400 });
  }

  await connectDB();

  const doc = await VerificationToken.findOne({
    token,
    type: "email_verify",
    expiresAt: { $gt: new Date() },
  });
  if (!doc) {
    return NextResponse.json(
      { code: "INVALID_TOKEN", error: "This link is invalid or has expired." },
      { status: 400 },
    );
  }

  await User.updateOne(
    { _id: doc.userId },
    { emailVerified: new Date() },
  );
  await VerificationToken.deleteOne({ _id: doc._id });

  return NextResponse.json({ ok: true });
}

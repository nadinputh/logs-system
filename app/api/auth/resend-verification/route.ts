import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { issueVerificationToken, verifyEmailLink } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email/send";

export const runtime = "nodejs";

const Schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  // Always neutral — never reveal whether the email maps to an account.
  const neutral = NextResponse.json({
    ok: true,
    message: "If that account needs verification, a new link is on its way.",
  });
  if (!parsed.success) return neutral;

  const email = parsed.data.email.toLowerCase().trim();
  await connectDB();

  const user = await User.findOne({ email });
  if (user && !user.emailVerified) {
    const token = await issueVerificationToken(user._id, email, "email_verify");
    await sendVerificationEmail(email, verifyEmailLink(token));
  }
  return neutral;
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { issueVerificationToken, verifyEmailLink } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email/send";
import { clientKey, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const Schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  // This endpoint sends mail to any address supplied, and answers neutrally in
  // every case — so without a limit it is both an email-bombing tool and a
  // silent one.
  const limited = rateLimit(clientKey(req, "resend"), 5, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

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
    try {
      await sendVerificationEmail(email, verifyEmailLink(token));
    } catch (err) {
      // Still answer neutrally: revealing a send failure would leak that the
      // address maps to an unverified account.
      console.error("[resend-verification] send failed:", err);
    }
  }
  return neutral;
}

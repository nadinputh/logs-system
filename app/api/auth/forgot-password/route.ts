import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import {
  issueVerificationToken,
  resetPasswordLink,
} from "@/lib/verification";
import { sendPasswordResetEmail, smtpConfigured } from "@/lib/email/send";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const Schema = z.object({ email: z.string().email() });

/**
 * Password-reset request.
 *
 * The response is deliberately neutral in the same way `resend-verification`
 * is: it reveals nothing about whether the address maps to an account, whether
 * that account is verified, or whether it has a password. It DOES report
 * `mailConfigured` — that is server state, independent of the address, and
 * lets the client stop promising a link the server cannot send.
 *
 * A reset link is issued only for a user who has *both* verified their email
 * and set a password. Unverified accounts and admin-provisioned passwordless
 * accounts have their own flows (`resend-verification`, `set-password`).
 */
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  // The endpoint sends mail to any address supplied. Without a limit it is
  // both a mail-bombing tool and a way to sample which addresses exist by
  // timing the response, so throttle even the neutral path.
  const limited = rateLimit(clientKey(req, "forgot"), 5, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  const neutral = NextResponse.json({
    ok: true,
    message:
      "If an account exists for that address, a reset link is on its way.",
    mailConfigured: smtpConfigured(),
  });
  if (!parsed.success) return neutral;

  const email = parsed.data.email.toLowerCase().trim();
  await connectDB();

  const user = await User.findOne({ email }).select(
    "_id emailVerified passwordHash",
  );
  if (user && user.emailVerified && user.passwordHash) {
    try {
      const { token, expiresAt } = await issueVerificationToken(
        user._id,
        email,
        "password_reset",
      );
      await sendPasswordResetEmail(email, resetPasswordLink(token), {
        expiresAt,
      });
    } catch (err) {
      // Stay neutral: revealing a send failure would leak that the address
      // resolves to a resettable account. Log for the operator instead.
      console.error("[forgot-password] send failed:", err);
    }
  }
  return neutral;
}

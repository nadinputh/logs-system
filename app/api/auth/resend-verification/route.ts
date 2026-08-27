import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import {
  issueVerificationToken,
  setPasswordLink,
  verifyEmailLink,
} from "@/lib/verification";
import {
  sendSetPasswordEmail,
  sendVerificationEmail,
  smtpConfigured,
} from "@/lib/email/send";
import { clientKey, rateLimit } from "@/lib/rateLimit";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const Schema = z.object({ email: z.string().email() });

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

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
  /**
   * Always neutral about the *address* — never reveal whether it maps to an
   * account. `mailConfigured` is server state, identical for every input, so it
   * reveals nothing about the address while letting the UI stop promising a
   * link that the server cannot send.
   */
  const neutral = NextResponse.json({
    ok: true,
    message: "If that account needs verification, a new link is on its way.",
    mailConfigured: smtpConfigured(),
  });
  if (!parsed.success) return neutral;

  const email = parsed.data.email.toLowerCase().trim();
  await connectDB();

  const user = await User.findOne({ email });
  if (user && (!user.emailVerified || !user.passwordHash)) {
    try {
      if (!user.passwordHash) {
        /**
         * An admin-provisioned account has no password, so an email_verify token
         * is the wrong instrument: following it marked the address verified and
         * left the account still unreachable — the one recovery button the user
         * could see appeared to work while moving them further from access.
         * Reissue the token type that actually opens the account.
         */
        const { token, expiresAt } = await issueVerificationToken(
          user._id,
          email,
          "set_password",
        );
        await sendSetPasswordEmail(email, setPasswordLink(token), { expiresAt });
      } else {
        const { token } = await issueVerificationToken(
          user._id,
          email,
          "email_verify",
        );
        await sendVerificationEmail(email, verifyEmailLink(token));
      }
    } catch (err) {
      // Still answer neutrally: revealing a send failure would leak that the
      // address maps to an unverified account.
      console.error("[resend-verification] send failed:", err);
    }
  }
  return neutral;
}

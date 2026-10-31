import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import {
  issueVerificationToken,
  recentlyIssued,
  reissueAsSetPassword,
  resetPasswordLink,
  setPasswordLink,
} from "@/lib/verification";
import { sendPasswordResetEmail, sendSetPasswordEmail, smtpConfigured } from "@/lib/email/send";
import { clientKey } from "@/lib/rateLimit";
import { rateLimitShared } from "@/lib/rateLimitShared";
import { assertSameOrigin } from "@/lib/csrf";
import { deferred, requestLocale } from "@/lib/server/deferred";
import { mailAllowed } from "@/lib/rateLimitGuard";
import { getClientIp, ipBucket } from "@/lib/server/getClientIp";
import { trackedSend } from "@/lib/server/trackedSend";

export const runtime = "nodejs";

const Schema = z.object({ email: z.string().email().max(254) });

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
  const limited = await rateLimitShared(clientKey(req, "forgot"), 5, 15 * 60 * 1000);
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
  // Deferred: mail is only sent for a resettable account, so awaiting it would
  // make response time an account-existence oracle.
  const ip = ipBucket(getClientIp(req));
  const locale = await requestLocale();
  await deferred(async () => {
    await connectDB();

    const user = await User.findOne({ email }).select(
      "_id emailVerified passwordHash",
    );
    if (!user || !(await mailAllowed(email, "reset", ip))) return;
    try {
      if (user.emailVerified && user.passwordHash) {
        if (await recentlyIssued(user._id, "password_reset")) return;
        const { token, expiresAt } = await issueVerificationToken(
          user._id,
          email,
          "password_reset",
        );
        await trackedSend(user._id, "password_reset", () =>
          sendPasswordResetEmail(email, resetPasswordLink(token), { expiresAt, locale }),
        );
      } else {
        // No password worth resetting: a provisioned account that never set one,
        // or a pending sign-up whose password nobody has proven they own. Login
        // no longer names these cases, so this is their recovery: a set-password
        // link, usable only by whoever controls the inbox.
        const issued = await reissueAsSetPassword(user._id, email);
        if (!issued) return;
        await trackedSend(user._id, "set_password", () =>
          sendSetPasswordEmail(email, setPasswordLink(issued.token), {
            expiresAt: issued.expiresAt,
            locale,
          }),
        );
      }
    } catch (err) {
      // Stay neutral: revealing a send failure would leak that the address
      // resolves to an account. Log for the operator instead.
      console.error("[forgot-password] send failed:", err);
    }
  });
  return neutral;
}

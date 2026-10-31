import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import {
  issueVerificationToken,
  recentlyIssued,
  reissueAsSetPassword,
  setPasswordLink,
} from "@/lib/verification";
import { sendSetPasswordEmail, smtpConfigured } from "@/lib/email/send";
import { deferred, requestLocale } from "@/lib/server/deferred";
import { clientKey } from "@/lib/rateLimit";
import { rateLimitShared } from "@/lib/rateLimitShared";
import { assertSameOrigin } from "@/lib/csrf";
import { mailAllowed } from "@/lib/rateLimitGuard";
import { getClientIp, ipBucket } from "@/lib/server/getClientIp";
import { trackedSend } from "@/lib/server/trackedSend";

export const runtime = "nodejs";

const Schema = z.object({ email: z.string().email().max(254) });

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  // This endpoint sends mail to any address supplied, and answers neutrally in
  // every case — so without a limit it is both an email-bombing tool and a
  // silent one.
  const limited = await rateLimitShared(clientKey(req, "resend"), 5, 15 * 60 * 1000);
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
  // Deferred so the response time is the same whether or not the address has an
  // account: the lookup, token write and SMTP send all happen afterwards.
  const ip = ipBucket(getClientIp(req));
  const locale = await requestLocale();
  await deferred(async () => {
    await connectDB();
    const user = await User.findOne({ email });
    if (!user || (user.emailVerified && user.passwordHash)) return;
    if (!(await mailAllowed(email, "resend", ip))) return;
    try {
      if (!user.passwordHash) {
        if (await recentlyIssued(user._id, "set_password")) return;
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
        await trackedSend(user._id, "set_password", () =>
          sendSetPasswordEmail(email, setPasswordLink(token), { expiresAt, locale }),
        );
      } else {
        // Unverified with a stored password: that password may belong to
        // whoever registered the address first, not its owner (see
        // reissueAsSetPassword). Only a verified account with a password never
        // reaches this branch.
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
      // Still answer neutrally: revealing a send failure would leak that the
      // address maps to an unverified account.
      console.error("[resend-verification] send failed:", err);
    }
  });
  return neutral;
}

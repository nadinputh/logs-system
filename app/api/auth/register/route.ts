import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import type { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Team } from "@/lib/models/Team";
import { TeamMember } from "@/lib/models/TeamMember";
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
import { mailAllowed } from "@/lib/rateLimitGuard";
import { deferred, requestLocale } from "@/lib/server/deferred";
import { getClientIp, ipBucket } from "@/lib/server/getClientIp";
import { trackedSend } from "@/lib/server/trackedSend";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  teamName: z.string().min(1).max(100),
});

/**
 * Neutral response — identical for new and unverified-existing accounts so the
 * endpoint never reveals whether an unverified email is already registered.
 *
 * It must be built per request. A `Response` body is a stream that can be read
 * exactly once, so a single module-level instance served the first registration
 * and then threw `TypeError: Body is unusable` on every one after it — a 500
 * returned *after* the user, team and membership had all been written, which
 * the user could never get past by retrying.
 */
/**
 * `delivered` reports whether the verification mail actually left the process.
 *
 * It leaks nothing: the neutrality this endpoint maintains is about whether an
 * *address* maps to an account, and a send failure is a server-side condition
 * independent of the address — identical for every input. Claiming "a link is on
 * its way" when the relay is unconfigured or missing told every registrant
 * something false and left them waiting on mail that never existed.
 */
const neutral = (delivered: boolean) =>
  NextResponse.json(
    {
      ok: true,
      delivered,
      message: delivered
        ? "Check your email to verify your account."
        : "Your workspace is ready, but the verification email could not be sent.",
    },
    { status: 201 },
  );

/**
 * The notification is not the account. If the mail server is down or
 * misconfigured, the account still exists and `resend-verification` is the
 * recovery, so a send failure is logged, not thrown. Throwing here left an
 * orphaned unverified account behind a 500, and the retry hit the same path.
 */
async function trySendSetPassword(email: string, link: string, locale?: "en" | "km") {
  try {
    return await sendSetPasswordEmail(email, link, { locale });
  } catch (err) {
    console.error("[register] set-password email failed to send:", err);
    return false;
  }
}

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "team"
  );
}

async function uniqueSlug(base: string) {
  const normalized = slugify(base);
  if (!(await Team.findOne({ slug: normalized }).select("_id").lean())) return normalized;
  // Taken: a random suffix, so many sign-ups with one team name do not each walk
  // name, name-2, name-3 ... (the unique index still settles a lost race).
  return `${normalized}-${randomBytes(3).toString("hex")}`;
}

async function createWorkspace(
  userId: Types.ObjectId,
  teamName: string,
  activate = true,
) {
  const slug = await uniqueSlug(teamName);
  const make = (s: string) =>
    Team.create({ name: teamName, slug: s, ownerUserId: userId, createdByUserId: userId });
  // Two sign-ups can pass the probe for the same slug; the unique index decides.
  // The loser retries once with a random suffix instead of leaving an account
  // with no workspace.
  const team = await make(slug).catch((err: any) => {
    if (err?.code !== 11000) throw err;
    return make(`${slug}-${randomBytes(3).toString("hex")}`);
  });
  await TeamMember.create({
    teamId: team._id,
    userId,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });
  if (activate) await User.updateOne({ _id: userId }, { activeTeamId: team._id });
}

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  // Each call mints a user AND a team, so an unthrottled endpoint is a way to
  // fill the database from the open internet.
  const limited = await rateLimitShared(clientKey(req, "register"), 5, 15 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  const parsed = RegisterSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, teamName } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  const ip = ipBucket(getClientIp(req));
  // Read now: the request context is gone once the response has been sent.
  const locale = await requestLocale();
  // Everything below runs after the response is sent. The work differs a lot by
  // case (a fresh account writes a user, a team and a membership and sends mail;
  // an existing address does a read and maybe a send), so awaiting it would make
  // response time a lookup for "is this address registered?". The reply is the
  // same for every address; `delivered` reflects server state (is mail
  // configured), not this address.
  await deferred(async () => {
    await connectDB();
    const existing = await User.findOne({ email });

    // A verified account already owns this address. The response stays identical
    // to a fresh sign-up (revealing it made this endpoint a lookup for "is X a
    // user?"); the owner, and only the owner, is told by mail, with a link that
    // lets them recover access.
    if (existing?.emailVerified) {
      if (!existing.passwordHash || !(await mailAllowed(email, "reset", ip))) return;
      // A reset link from the last two minutes is still live in their inbox;
      // issuing another would delete it, so a stranger could keep killing it.
      if (await recentlyIssued(existing._id, "password_reset")) return;
      const { token, expiresAt } = await issueVerificationToken(
        existing._id,
        email,
        "password_reset",
      );
      await trackedSend(existing._id, "password_reset", () =>
        sendPasswordResetEmail(email, resetPasswordLink(token), { expiresAt, locale }),
      );
      return;
    }

    if (existing) {
      // Unverified account exists: stay neutral, and trust nobody's password.
      // Keeping the first registrant's would let a pre-registering attacker log
      // in once the real owner verifies; replacing it with this request's would
      // let a later attacker do the same to a pending signup. Instead drop the
      // password and mail a set-password link, which only the inbox owner can use.
      if (!(await mailAllowed(email, "signup", ip))) return;
      const issued = await reissueAsSetPassword(existing._id, email);
      if (!issued) return;
      await trackedSend(existing._id, "set_password", () =>
        trySendSetPassword(email, setPasswordLink(issued.token), locale),
      );
      // No workspace is created here. This request is unauthenticated: whoever
      // typed the address has not proved they own the inbox, and a team named by
      // them must not appear in that account. The owner creates or joins one
      // after setting a password.
      return;
    }

    // No password is stored at sign-up. An unverified address may belong to
    // someone else, and a password chosen by whoever typed it would become the
    // account's password once the real owner clicked the mailed link. The link is
    // a set-password link instead: the inbox owner chooses the password.
    const user = await User.create({
      name,
      email,
      role: "staff",
      emailVerified: null,
      termsAcceptedAt: new Date(),
    });

    await createWorkspace(user._id, teamName);

    const { token } = await issueVerificationToken(user._id, email, "set_password");
    await trySendSetPassword(email, setPasswordLink(token), locale);
  });

  return neutral(smtpConfigured());
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Team } from "@/lib/models/Team";
import { TeamMember } from "@/lib/models/TeamMember";
import { issueVerificationToken, verifyEmailLink } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email/send";
import { clientKey, rateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
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
 * recovery — so a send failure is logged, not thrown. Throwing here left an
 * orphaned unverified account behind a 500, and the retry hit the same path.
 */
async function trySendVerification(email: string, link: string) {
  try {
    return await sendVerificationEmail(email, link);
  } catch (err) {
    console.error("[register] verification email failed to send:", err);
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
  let candidate = normalized;
  let n = 2;
  while (await Team.findOne({ slug: candidate }).select("_id").lean()) {
    candidate = `${normalized}-${n++}`;
  }
  return candidate;
}

export async function POST(req: NextRequest) {
  // Each call mints a user AND a team, so an unthrottled endpoint is a way to
  // fill the database from the open internet.
  const limited = rateLimit(clientKey(req, "register"), 5, 15 * 60 * 1000);
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

  const { name, password, teamName } = parsed.data;
  const email = parsed.data.email.toLowerCase().trim();

  await connectDB();

  const existing = await User.findOne({ email });

  // Verified account already owns this email — the one case we reveal.
  if (existing?.emailVerified) {
    return NextResponse.json(
      { code: "EMAIL_IN_USE", error: "Email already in use." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    // Unverified account exists — refresh credentials and resend, stay neutral.
    existing.name = name;
    existing.passwordHash = passwordHash;
    await existing.save();
    const { token } = await issueVerificationToken(existing._id, email, "email_verify");
    const delivered = await trySendVerification(email, verifyEmailLink(token));
    return neutral(delivered);
  }

  const user = await User.create({
    name,
    email,
    passwordHash,
    role: "staff",
    emailVerified: null,
  });

  const slug = await uniqueSlug(teamName);
  const team = await Team.create({
    name: teamName,
    slug,
    ownerUserId: user._id,
    createdByUserId: user._id,
  });
  await TeamMember.create({
    teamId: team._id,
    userId: user._id,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });
  await User.updateOne({ _id: user._id }, { activeTeamId: team._id });

  const { token } = await issueVerificationToken(user._id, email, "email_verify");
  const delivered = await trySendVerification(email, verifyEmailLink(token));

  return neutral(delivered);
}

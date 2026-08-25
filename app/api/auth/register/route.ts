import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Team } from "@/lib/models/Team";
import { TeamMember } from "@/lib/models/TeamMember";
import { issueVerificationToken, verifyEmailLink } from "@/lib/verification";
import { sendVerificationEmail } from "@/lib/email/send";

export const runtime = "nodejs";

const RegisterSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(200),
  teamName: z.string().min(1).max(100),
});

// Neutral response — identical for new and unverified-existing accounts so the
// endpoint never reveals whether an unverified email is already registered.
const NEUTRAL = NextResponse.json(
  { ok: true, message: "Check your email to verify your account." },
  { status: 201 },
);

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
  const parsed = RegisterSchema.safeParse(await req.json());
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
    const token = await issueVerificationToken(existing._id, email, "email_verify");
    await sendVerificationEmail(email, verifyEmailLink(token));
    return NEUTRAL;
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

  const token = await issueVerificationToken(user._id, email, "email_verify");
  await sendVerificationEmail(email, verifyEmailLink(token));

  return NEUTRAL;
}

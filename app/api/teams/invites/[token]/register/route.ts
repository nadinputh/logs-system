import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { connectDB } from "@/lib/db";
import { TeamInvite } from "@/lib/models/TeamInvite";
import { TeamMember } from "@/lib/models/TeamMember";
import { User } from "@/lib/models/User";

export const runtime = "nodejs";

const Schema = z.object({
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
});

// Unauthenticated: creates a brand-new account FROM an invite. Possession of the
// emailed invite token proves control of the address, so the account is created
// already email-verified.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();

  const invite = await TeamInvite.findOne({
    token,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
  if (!invite) {
    return NextResponse.json(
      { code: "INVALID_INVITE", error: "This invite is invalid or has expired." },
      { status: 404 },
    );
  }
  if (invite.role === "owner") {
    return NextResponse.json(
      { error: "Owner role cannot be granted through an invite." },
      { status: 400 },
    );
  }

  const email = invite.email.toLowerCase();

  // If an account already exists, this is the wrong path — they must sign in.
  if (await User.findOne({ email }).select("_id").lean()) {
    return NextResponse.json(
      { code: "ACCOUNT_EXISTS", error: "An account already exists for this email. Please sign in to accept." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const user = await User.create({
    name: parsed.data.name,
    email,
    passwordHash,
    role: "staff",
    emailVerified: new Date(), // invite token possession == email control
    activeTeamId: invite.teamId,
  });

  await TeamMember.create({
    teamId: invite.teamId,
    userId: user._id,
    role: invite.role,
    status: "active",
    joinedAt: new Date(),
  });

  invite.status = "accepted";
  await invite.save();

  // Client signs in with these credentials immediately after.
  return NextResponse.json({ ok: true, email }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { connectDB } from "@/lib/db";
import { TeamInvite } from "@/lib/models/TeamInvite";
import { TeamMember } from "@/lib/models/TeamMember";
import { Team } from "@/lib/models/Team";
import { User } from "@/lib/models/User";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { hashToken, inviteLink } from "@/lib/verification";
import { sendInviteEmail } from "@/lib/email/send";

export const runtime = "nodejs";

const CreateInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "manager", "member", "auditor"]).default("member"),
});

const RevokeInviteSchema = z.object({
  inviteId: z.string().min(1),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireTeamPermission("team.invites.read", { teamId: id });
  if (auth.error || !auth.teamId) return auth.error;

  await connectDB();

  const invites = await TeamInvite.find({
    teamId: auth.teamId,
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();

  return NextResponse.json({
    invites: invites.map((invite: any) => ({
      id: invite._id.toString(),
      email: invite.email,
      role: invite.role,
      status: invite.status,
      expiresAt: invite.expiresAt,
      // The token is not returned here. Only its hash is stored, so there is no
      // plaintext to return — reissue via POST to get a fresh link.
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireTeamPermission("team.invites.manage", {
    teamId: id,
  });
  if (auth.error || !auth.teamId || !auth.membership || !auth.session?.user) {
    return auth.error;
  }

  const body = await req.json();
  const parsed = CreateInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (auth.membership.role !== "owner" && parsed.data.role === "admin") {
    return NextResponse.json(
      { error: "Only team owner can invite another team admin" },
      { status: 403 },
    );
  }

  await connectDB();

  const email = parsed.data.email.trim().toLowerCase();
  const existingUser = await User.findOne({ email }).select("_id").lean<any>();

  if (existingUser) {
    const existingMember = await TeamMember.findOne({
      teamId: auth.teamId,
      userId: existingUser._id,
      status: "active",
    })
      .select("_id")
      .lean();

    if (existingMember) {
      return NextResponse.json(
        { error: "User is already an active member of this team" },
        { status: 400 },
      );
    }
  }

  // The plaintext exists only long enough to be put in the link; the row keeps
  // its hash. An invite is a seven-day bearer credential, and lib/verification.ts
  // already makes this argument for the shorter-lived verification tokens.
  const plainToken = uuidv4();
  const invite = await TeamInvite.findOneAndUpdate(
    {
      teamId: auth.teamId,
      email,
      status: "pending",
      expiresAt: { $gt: new Date() },
    },
    {
      teamId: auth.teamId,
      email,
      role: parsed.data.role,
      invitedByUserId: (auth.session.user as any).id,
      token: hashToken(plainToken),
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
    {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    },
  ).lean<any>();

  // Email the invite link (best-effort — copy-link is still returned below).
  let emailDelivered = false;
  try {
    const team = await Team.findById(auth.teamId).select("name").lean<any>();
    emailDelivered = await sendInviteEmail(email, inviteLink(plainToken), {
      teamName: team?.name ?? "a team",
      role: invite.role,
      invitedByName: (auth.session.user as any)?.name ?? undefined,
      expiresAt: invite.expiresAt,
    });
  } catch (err) {
    console.error("Failed to send invite email:", err);
  }

  return NextResponse.json(
    {
      invite: {
        id: invite._id.toString(),
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
        // Returned once, here only: this is the last moment the plaintext exists.
        token: plainToken,
      },
      emailDelivered,
      inviteUrl: inviteLink(plainToken),
    },
    { status: 201 },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireTeamPermission("team.invites.manage", {
    teamId: id,
  });
  if (auth.error || !auth.teamId) return auth.error;

  const body = await req.json();
  const parsed = RevokeInviteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();

  const invite = await TeamInvite.findOneAndUpdate(
    {
      _id: parsed.data.inviteId,
      teamId: auth.teamId,
      status: "pending",
      expiresAt: { $gt: new Date() },
    },
    { status: "revoked" },
    { returnDocument: "after" },
  ).lean<any>();

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, inviteId: invite._id.toString() });
}

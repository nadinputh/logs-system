import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { TeamInvite } from "@/lib/models/TeamInvite";
import { hashToken } from "@/lib/verification";
import { TeamMember } from "@/lib/models/TeamMember";
import { User } from "@/lib/models/User";
import { requireAuth } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const { token } = await params;
  const { error, session } = await requireAuth();
  if (error || !session?.user) return error;

  await connectDB();

  const invite = await TeamInvite.findOne({
    // Only the hash is stored; see lib/models/TeamInvite.ts.
    token: hashToken(token),
    status: "pending",
    expiresAt: { $gt: new Date() },
  });

  if (!invite) {
    return NextResponse.json(
      { error: "Invite not found or expired" },
      { status: 404 },
    );
  }

  const sessionEmail = ((session.user as any).email ?? "").toLowerCase().trim();
  if (sessionEmail !== invite.email.toLowerCase()) {
    return NextResponse.json(
      { error: "This invite was issued for a different email address" },
      { status: 403 },
    );
  }

  if (invite.role === "owner") {
    return NextResponse.json(
      { error: "Owner role cannot be accepted through invite" },
      { status: 400 },
    );
  }

  const userId = (session.user as any).id;

  await TeamMember.findOneAndUpdate(
    { teamId: invite.teamId, userId },
    {
      teamId: invite.teamId,
      userId,
      role: invite.role,
      status: "active",
      joinedAt: new Date(),
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  invite.status = "accepted";
  await invite.save();

  const user = await User.findById(userId).select("activeTeamId").lean<any>();
  if (!user?.activeTeamId) {
    await User.updateOne({ _id: userId }, { activeTeamId: invite.teamId });
  }

  return NextResponse.json({
    ok: true,
    teamId: invite.teamId.toString(),
    role: invite.role,
  });
}

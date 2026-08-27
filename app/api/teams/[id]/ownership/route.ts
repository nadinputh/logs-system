import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { Team } from "@/lib/models/Team";
import { TeamMember, TeamRole } from "@/lib/models/TeamMember";
import { User } from "@/lib/models/User";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { recordTeamAuditEvent } from "@/lib/teamAudit";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const TransferOwnershipSchema = z.object({
  targetUserId: z.string().min(1),
  demoteCurrentOwnerRole: z
    .enum(["admin", "manager", "member", "auditor"])
    .default("admin"),
});

export async function POST(
  req: NextRequest,
  {
 params }: { params: Promise<{ id: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const { id } = await params;
  const auth = await requireTeamPermission("team.ownership.transfer", {
    teamId: id,
  });
  if (auth.error || !auth.teamId || !auth.session?.user || !auth.membership) {
    return auth.error;
  }

  const actorUserId = (auth.session.user as any).id;
  if (!Types.ObjectId.isValid(actorUserId)) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  const body = await req.json();
  const parsed = TransferOwnershipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { targetUserId, demoteCurrentOwnerRole } = parsed.data;
  if (!Types.ObjectId.isValid(targetUserId)) {
    return NextResponse.json({ error: "Invalid target user" }, { status: 400 });
  }

  if (targetUserId === actorUserId) {
    return NextResponse.json(
      { error: "Target user must be different from current owner" },
      { status: 400 },
    );
  }

  await connectDB();

  const team = await Team.findOne({
    _id: auth.teamId,
    ownerUserId: actorUserId,
  })
    .select("_id ownerUserId")
    .lean<any>();

  if (!team) {
    return NextResponse.json(
      { error: "Only current owner can transfer ownership" },
      { status: 403 },
    );
  }

  const [actorMembership, targetMembership] = await Promise.all([
    TeamMember.findOne({
      teamId: auth.teamId,
      userId: actorUserId,
      status: "active",
    })
      .select("_id role")
      .lean<any>(),
    TeamMember.findOne({
      teamId: auth.teamId,
      userId: targetUserId,
      status: "active",
    })
      .select("_id role")
      .lean<any>(),
  ]);

  if (!actorMembership || actorMembership.role !== "owner") {
    return NextResponse.json(
      { error: "Current owner membership is missing or invalid" },
      { status: 409 },
    );
  }

  if (!targetMembership) {
    return NextResponse.json(
      { error: "Target user must be an active team member" },
      { status: 404 },
    );
  }

  if (targetMembership.role === "owner") {
    return NextResponse.json(
      { error: "Target user is already owner" },
      { status: 400 },
    );
  }

  await Promise.all([
    Team.updateOne({ _id: auth.teamId }, { ownerUserId: targetUserId }),
    TeamMember.updateOne(
      { teamId: auth.teamId, userId: actorUserId },
      { role: demoteCurrentOwnerRole as TeamRole, status: "active" },
    ),
    TeamMember.updateOne(
      { teamId: auth.teamId, userId: targetUserId },
      { role: "owner", status: "active" },
    ),
    User.updateOne(
      {
        _id: targetUserId,
        $or: [{ activeTeamId: { $exists: false } }, { activeTeamId: null }],
      },
      { activeTeamId: auth.teamId },
    ),
  ]);

  await recordTeamAuditEvent({
    teamId: auth.teamId,
    actorUserId,
    targetUserId,
    action: "ownership_transferred",
    metadata: {
      previousOwnerUserId: actorUserId,
      newOwnerUserId: targetUserId,
      previousOwnerNewRole: demoteCurrentOwnerRole,
      newOwnerPreviousRole: targetMembership.role,
    },
  });

  return NextResponse.json({
    ok: true,
    teamId: auth.teamId,
    previousOwnerUserId: actorUserId,
    newOwnerUserId: targetUserId,
    previousOwnerNewRole: demoteCurrentOwnerRole,
  });
}

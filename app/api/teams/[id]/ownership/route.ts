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
import { TeamInvite } from "@/lib/models/TeamInvite";

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
  if (auth.error) return auth.error;

  const actorUserId = (auth.session.user as any).id;
  if (!Types.ObjectId.isValid(actorUserId)) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
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

  // No multi-document transaction (standalone Mongo has none), so the swap is
  // ordered and compensated instead of fired in parallel: the first step is a
  // compare-and-set on the current owner, which also serialises two concurrent
  // transfers; a failure later rolls the earlier steps back, so the team is
  // never left with two owners or none.
  const claimed: any = await Team.updateOne(
    { _id: auth.teamId, ownerUserId: actorUserId },
    { ownerUserId: targetUserId },
  );
  if (claimed?.matchedCount === 0) {
    return NextResponse.json(
      { error: "Ownership changed while transferring. Reload and retry." },
      { status: 409 },
    );
  }
  try {
    await TeamMember.updateOne(
      { teamId: auth.teamId, userId: targetUserId },
      { role: "owner", status: "active" },
    );
    await TeamMember.updateOne(
      { teamId: auth.teamId, userId: actorUserId },
      { role: demoteCurrentOwnerRole as TeamRole, status: "active" },
    );
  } catch (err) {
    await Promise.allSettled([
      Team.updateOne({ _id: auth.teamId }, { ownerUserId: actorUserId }),
      TeamMember.updateOne(
        { teamId: auth.teamId, userId: targetUserId },
        { role: targetMembership.role },
      ),
      TeamMember.updateOne(
        { teamId: auth.teamId, userId: actorUserId },
        { role: "owner" },
      ),
    ]);
    throw err;
  }
  // Invites carry the inviter's authority at the time they were written (only an
  // owner may invite an admin). The old owner's must not outlive the handover.
  await TeamInvite.updateMany(
    { teamId: auth.teamId, invitedByUserId: actorUserId, status: "pending" },
    { status: "revoked" },
  ).catch((err: unknown) => console.error("[ownership] invite revoke failed:", err));
  await User.updateOne(
    {
      _id: targetUserId,
      $or: [{ activeTeamId: { $exists: false } }, { activeTeamId: null }],
    },
    { activeTeamId: auth.teamId },
  );

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

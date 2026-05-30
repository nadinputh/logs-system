import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { TeamMember, TeamRole } from "@/lib/models/TeamMember";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { recordTeamAuditEvent } from "@/lib/teamAudit";

export const runtime = "nodejs";

const TEAM_ROLE_WEIGHT: Record<TeamRole, number> = {
  auditor: 0,
  member: 1,
  manager: 2,
  admin: 3,
  owner: 4,
};

const UpdateMemberSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["owner", "admin", "manager", "member", "auditor"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  remove: z.boolean().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireTeamPermission("team.members.read", { teamId: id });
  if (auth.error || !auth.teamId) return auth.error;

  await connectDB();

  const members = await TeamMember.find({ teamId: auth.teamId })
    .populate("userId", "name email role activeTeamId")
    .sort({ createdAt: 1 })
    .lean<any[]>();

  return NextResponse.json({
    members: members.map((m) => ({
      userId: m.userId?._id?.toString?.() ?? null,
      name: m.userId?.name ?? null,
      email: m.userId?.email ?? null,
      systemRole: m.userId?.role ?? null,
      teamRole: m.role,
      status: m.status,
      joinedAt: m.joinedAt,
      isSelf: m.userId?._id?.toString?.() === (auth.session?.user as any)?.id,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireTeamPermission("team.members.manage", {
    teamId: id,
  });
  if (auth.error || !auth.teamId || !auth.membership) return auth.error;

  const body = await req.json();
  const parsed = UpdateMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const actorRole = auth.membership.role as TeamRole;
  const actorUserId = (auth.session!.user as any).id;
  const { userId, role, status, remove } = parsed.data;

  if (!Types.ObjectId.isValid(actorUserId)) {
    return NextResponse.json({ error: "Invalid actor" }, { status: 400 });
  }

  if (!Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  if (!remove && role === undefined && status === undefined) {
    return NextResponse.json(
      { error: "No update fields provided" },
      { status: 400 },
    );
  }

  await connectDB();

  const target = await TeamMember.findOne({ teamId: auth.teamId, userId });
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const targetRole = target.role as TeamRole;
  const actorRank = TEAM_ROLE_WEIGHT[actorRole];
  const targetRank = TEAM_ROLE_WEIGHT[targetRole];

  if (targetRole === "owner") {
    return NextResponse.json(
      {
        error: "Owner role cannot be edited here. Use ownership transfer flow.",
      },
      { status: 403 },
    );
  }

  if (actorUserId === userId && remove) {
    return NextResponse.json(
      { error: "Cannot remove yourself" },
      { status: 400 },
    );
  }

  if (actorRole !== "owner") {
    if (actorRank <= targetRank) {
      return NextResponse.json(
        { error: "Insufficient privilege" },
        { status: 403 },
      );
    }
    if (role && TEAM_ROLE_WEIGHT[role as TeamRole] >= actorRank) {
      return NextResponse.json(
        { error: "Cannot assign equal/higher role" },
        { status: 403 },
      );
    }
  }

  if (role === "owner") {
    return NextResponse.json(
      { error: "Owner assignment requires dedicated ownership transfer." },
      { status: 400 },
    );
  }

  if (remove) {
    await TeamMember.deleteOne({ _id: target._id });

    await recordTeamAuditEvent({
      teamId: auth.teamId,
      actorUserId,
      targetUserId: userId,
      action: "member_removed",
      metadata: {
        previousRole: target.role,
        previousStatus: target.status,
      },
    });

    return NextResponse.json({ ok: true, removed: true });
  }

  const previousRole = target.role;
  const previousStatus = target.status;

  const updatePayload: Record<string, unknown> = {};
  if (role) updatePayload.role = role;
  if (status) updatePayload.status = status;

  const updated = await TeamMember.findOneAndUpdate(
    { _id: target._id },
    updatePayload,
    { returnDocument: "after" },
  )
    .populate("userId", "name email role activeTeamId")
    .lean<any>();

  const auditWrites: Array<Promise<unknown>> = [];

  if (previousRole !== updated.role) {
    auditWrites.push(
      recordTeamAuditEvent({
        teamId: auth.teamId,
        actorUserId,
        targetUserId: userId,
        action: "member_role_changed",
        metadata: {
          previousRole,
          newRole: updated.role,
        },
      }),
    );
  }

  if (previousStatus !== updated.status) {
    auditWrites.push(
      recordTeamAuditEvent({
        teamId: auth.teamId,
        actorUserId,
        targetUserId: userId,
        action: "member_status_changed",
        metadata: {
          previousStatus,
          newStatus: updated.status,
        },
      }),
    );
  }

  if (auditWrites.length > 0) {
    await Promise.all(auditWrites);
  }

  return NextResponse.json({
    ok: true,
    member: {
      userId: updated.userId?._id?.toString?.() ?? null,
      name: updated.userId?.name ?? null,
      email: updated.userId?.email ?? null,
      systemRole: updated.userId?.role ?? null,
      teamRole: updated.role,
      status: updated.status,
      joinedAt: updated.joinedAt,
    },
  });
}

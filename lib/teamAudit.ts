import { Types } from "mongoose";
import { TeamAuditAction, TeamAuditLog } from "@/lib/models/TeamAuditLog";

interface RecordTeamAuditEventInput {
  teamId: string;
  actorUserId: string;
  action: TeamAuditAction;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
}

function toObjectId(value: string, fieldName: string) {
  if (!Types.ObjectId.isValid(value)) {
    throw new Error(`Invalid ${fieldName}`);
  }
  return new Types.ObjectId(value);
}

export async function recordTeamAuditEvent(input: RecordTeamAuditEventInput) {
  await TeamAuditLog.create({
    teamId: toObjectId(input.teamId, "teamId"),
    actorUserId: toObjectId(input.actorUserId, "actorUserId"),
    action: input.action,
    targetUserId: input.targetUserId
      ? toObjectId(input.targetUserId, "targetUserId")
      : undefined,
    metadata: input.metadata ?? undefined,
    createdAt: new Date(),
  });
}

import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type TeamAuditAction =
  | "member_role_changed"
  | "member_status_changed"
  | "member_removed"
  | "ownership_transferred";

export interface ITeamAuditLog extends Document {
  teamId: Types.ObjectId;
  actorUserId: Types.ObjectId;
  action: TeamAuditAction;
  targetUserId?: Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const TeamAuditLogSchema = new Schema<ITeamAuditLog>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: {
      type: String,
      enum: [
        "member_role_changed",
        "member_status_changed",
        "member_removed",
        "ownership_transferred",
      ],
      required: true,
    },
    targetUserId: { type: Schema.Types.ObjectId, ref: "User" },
    metadata: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

TeamAuditLogSchema.index({ teamId: 1, createdAt: -1 });
TeamAuditLogSchema.index({ actorUserId: 1, createdAt: -1 });
TeamAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
TeamAuditLogSchema.index({ action: 1, createdAt: -1 });

if (
  mongoose.models.TeamAuditLog &&
  !mongoose.models.TeamAuditLog.schema.path("action")
) {
  delete mongoose.models.TeamAuditLog;
}

export const TeamAuditLog: Model<ITeamAuditLog> =
  mongoose.models.TeamAuditLog ||
  mongoose.model<ITeamAuditLog>("TeamAuditLog", TeamAuditLogSchema);

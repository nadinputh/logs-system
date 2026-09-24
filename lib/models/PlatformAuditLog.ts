import mongoose, { Document, Model, Schema, Types } from "mongoose";

/**
 * Cross-team superadmin action trail — distinct from the per-team
 * BillingEvent/AuditLog/TeamAuditLog ledgers, which a team's own owner can
 * see. This one is platform-admin-only and covers non-billing actions
 * (billing-specific grants/comps write to BillingEvent instead, so a team's
 * own Billing page never needs to read from a cross-team collection).
 */
export type PlatformAuditAction =
  | "team_suspended"
  | "team_reactivated"
  | "user_disabled"
  | "user_enabled"
  | "user_force_signed_out"
  | "plan_created"
  | "plan_updated"
  | "coupon_created"
  | "coupon_updated"
  | "coupon_deactivated";

export type PlatformAuditTargetType = "team" | "user" | "plan" | "coupon";

export interface IPlatformAuditLog extends Document {
  actorUserId: Types.ObjectId;
  action: PlatformAuditAction;
  targetType: PlatformAuditTargetType;
  targetId: Types.ObjectId;
  detail?: Record<string, unknown>;
  timestamp: Date;
}

const PlatformAuditLogSchema = new Schema<IPlatformAuditLog>(
  {
    actorUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: {
      type: String,
      enum: [
        "team_suspended",
        "team_reactivated",
        "user_disabled",
        "user_enabled",
        "user_force_signed_out",
        "plan_created",
        "plan_updated",
        "coupon_created",
        "coupon_updated",
        "coupon_deactivated",
      ],
      required: true,
    },
    targetType: { type: String, enum: ["team", "user", "plan", "coupon"], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    detail: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

PlatformAuditLogSchema.index({ timestamp: -1 });
PlatformAuditLogSchema.index({ actorUserId: 1, timestamp: -1 });
PlatformAuditLogSchema.index({ targetType: 1, targetId: 1, timestamp: -1 });

if (
  mongoose.models.PlatformAuditLog &&
  !mongoose.models.PlatformAuditLog.schema.path("targetType")
) {
  delete mongoose.models.PlatformAuditLog;
}

export const PlatformAuditLog: Model<IPlatformAuditLog> =
  mongoose.models.PlatformAuditLog ||
  mongoose.model<IPlatformAuditLog>("PlatformAuditLog", PlatformAuditLogSchema);

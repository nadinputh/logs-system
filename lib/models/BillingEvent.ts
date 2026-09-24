import mongoose, { Document, Model, Schema, Types } from "mongoose";

export type BillingEventType =
  | "checkout_completed"
  | "renewed"
  | "payment_failed"
  | "canceled"
  | "plan_changed"
  | "comped"
  | "comp_revoked";

export interface IBillingEvent extends Document {
  teamId: Types.ObjectId;
  type: BillingEventType;
  fromPlanId?: Types.ObjectId;
  toPlanId?: Types.ObjectId;
  actorUserId?: Types.ObjectId; // absent when webhook-driven rather than a person's action
  providerEventId?: string; // Stripe event id, for idempotent webhook replay
  note?: string;
  raw?: Record<string, unknown>;
  timestamp: Date;
}

const BillingEventSchema = new Schema<IBillingEvent>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    type: {
      type: String,
      enum: [
        "checkout_completed",
        "renewed",
        "payment_failed",
        "canceled",
        "plan_changed",
        "comped",
        "comp_revoked",
      ],
      required: true,
    },
    fromPlanId: { type: Schema.Types.ObjectId, ref: "Plan" },
    toPlanId: { type: Schema.Types.ObjectId, ref: "Plan" },
    actorUserId: { type: Schema.Types.ObjectId, ref: "User" },
    providerEventId: { type: String },
    note: { type: String, trim: true },
    raw: { type: Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

BillingEventSchema.index({ teamId: 1, timestamp: -1 });
BillingEventSchema.index({ providerEventId: 1 });
BillingEventSchema.index({ type: 1, timestamp: -1 });

if (
  mongoose.models.BillingEvent &&
  !mongoose.models.BillingEvent.schema.path("type")
) {
  delete mongoose.models.BillingEvent;
}

export const BillingEvent: Model<IBillingEvent> =
  mongoose.models.BillingEvent ||
  mongoose.model<IBillingEvent>("BillingEvent", BillingEventSchema);

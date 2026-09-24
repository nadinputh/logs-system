import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

// "mock" is written only by the dev-mode billing bypass (BILLING_MOCK_MODE) —
// it behaves like "stripe" (a real, externally-driven paid subscription) for
// every gate that checks `provider !== "manual"`, but is never written when
// BILLING_MOCK_MODE is unset, so it can't leak into a real environment.
export type SubscriptionProvider = "stripe" | "manual" | "mock";
export type SubscriptionGrantType = "paid" | "manual_comp";

export interface ISubscription extends Document {
  teamId: Types.ObjectId;
  planId: Types.ObjectId;
  status: SubscriptionStatus;
  provider: SubscriptionProvider | null;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  trialEndsAt?: Date | null;
  pastDueSince?: Date | null; // set when status first flips to past_due — drives the 7-day grace window
  // Manual-grant fields. Absent (provider: "stripe") for a normal paid subscription.
  grantType?: SubscriptionGrantType;
  grantedByUserId?: Types.ObjectId;
  grantReason?: string;
  grantExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      unique: true,
    },
    planId: { type: Schema.Types.ObjectId, ref: "Plan", required: true },
    status: {
      type: String,
      enum: ["trialing", "active", "past_due", "canceled", "incomplete"],
      required: true,
      default: "active",
    },
    provider: { type: String, enum: ["stripe", "manual", "mock", null], default: null },
    providerCustomerId: { type: String },
    providerSubscriptionId: { type: String },
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    trialEndsAt: { type: Date, default: null },
    pastDueSince: { type: Date, default: null },
    grantType: { type: String, enum: ["paid", "manual_comp"] },
    grantedByUserId: { type: Schema.Types.ObjectId, ref: "User" },
    grantReason: { type: String, trim: true },
    grantExpiresAt: { type: Date, default: null },
  },
  { timestamps: true },
);

SubscriptionSchema.index({ status: 1 });
SubscriptionSchema.index({ providerSubscriptionId: 1 });

if (
  mongoose.models.Subscription &&
  !mongoose.models.Subscription.schema.path("grantType")
) {
  delete mongoose.models.Subscription;
}

export const Subscription: Model<ISubscription> =
  mongoose.models.Subscription ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);

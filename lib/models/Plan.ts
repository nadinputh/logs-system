import mongoose, { Schema, Document, Model } from "mongoose";

export type BillingCycle = "monthly" | "annual";

export interface IPlanLimits {
  maxBuildings: number | null; // null = unlimited
  maxTeamMembers: number | null;
  maxQuestCards: number | null;
  logRetentionDays: number | null;
  blePush: boolean;
}

export interface IPlan extends Document {
  key: string; // stable identifier used in code, e.g. "pro" — shared across the monthly/annual pair
  name: string;
  billingCycle: BillingCycle;
  priceCents: number;
  currency: string;
  stripePriceId?: string; // absent for the non-purchasable legacy-unlimited plan
  trialDays: number; // 0 = no trial
  limits: IPlanLimits;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PlanLimitsSchema = new Schema<IPlanLimits>(
  {
    maxBuildings: { type: Number, default: null },
    maxTeamMembers: { type: Number, default: null },
    maxQuestCards: { type: Number, default: null },
    logRetentionDays: { type: Number, default: null },
    blePush: { type: Boolean, default: false },
  },
  { _id: false },
);

const PlanSchema = new Schema<IPlan>(
  {
    key: { type: String, required: true, trim: true, lowercase: true },
    name: { type: String, required: true, trim: true },
    billingCycle: { type: String, enum: ["monthly", "annual"], required: true },
    priceCents: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "usd", lowercase: true },
    stripePriceId: { type: String },
    trialDays: { type: Number, default: 0 },
    limits: { type: PlanLimitsSchema, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// key+billingCycle uniquely identifies a row ("pro"+"monthly" vs "pro"+"annual").
PlanSchema.index({ key: 1, billingCycle: 1 }, { unique: true });
PlanSchema.index({ isActive: 1 });

if (
  mongoose.models.Plan &&
  !mongoose.models.Plan.schema.path("billingCycle")
) {
  delete mongoose.models.Plan;
}

export const Plan: Model<IPlan> =
  mongoose.models.Plan || mongoose.model<IPlan>("Plan", PlanSchema);

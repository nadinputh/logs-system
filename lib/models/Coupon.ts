import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CouponType = "percent" | "fixed";
export type CouponAppliesTo = "monthly" | "annual" | "both";

export interface ICoupon extends Document {
  code: string;
  type: CouponType;
  value: number; // percent (1-100) or fixed cents, per `type`
  appliesTo: CouponAppliesTo;
  planIds: Types.ObjectId[]; // empty = any plan
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: Date | null;
  isActive: boolean;
  isPublic: boolean; // true: offered in Stripe Checkout's promo-code field. false: superadmin-applied only.
  stripeCouponId?: string;
  createdByUserId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, trim: true, uppercase: true, unique: true },
    type: { type: String, enum: ["percent", "fixed"], required: true },
    value: { type: Number, required: true, min: 0 },
    appliesTo: { type: String, enum: ["monthly", "annual", "both"], default: "both" },
    planIds: [{ type: Schema.Types.ObjectId, ref: "Plan" }],
    maxRedemptions: { type: Number, default: null },
    redemptionCount: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: false },
    stripeCouponId: { type: String },
    createdByUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

CouponSchema.index({ isActive: 1, isPublic: 1 });

if (mongoose.models.Coupon && !mongoose.models.Coupon.schema.path("isPublic")) {
  delete mongoose.models.Coupon;
}

export const Coupon: Model<ICoupon> =
  mongoose.models.Coupon || mongoose.model<ICoupon>("Coupon", CouponSchema);

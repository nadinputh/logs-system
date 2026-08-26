import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type VerificationTokenType = "email_verify" | "set_password";

export interface IVerificationToken extends Document {
  token: string;
  userId: Types.ObjectId;
  email: string;
  type: VerificationTokenType;
  expiresAt: Date;
  createdAt: Date;
  /** Set when the token is redeemed. Present = spent, and never valid again. */
  consumedAt?: Date | null;
}

const VerificationTokenSchema = new Schema<IVerificationToken>(
  {
    token: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    type: {
      type: String,
      enum: ["email_verify", "set_password"],
      required: true,
    },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
    // Redeeming used to delete the row outright, which made "already redeemed"
    // indistinguishable from "never existed" — so a refreshed verify tab, or
    // React StrictMode double-invoking the effect, told a user whose email had
    // just been verified that their link had expired. Marking it spent keeps
    // it single-use while preserving that distinction; the TTL index below
    // still purges it at expiry.
    consumedAt: { type: Date, default: null },
  },
  { timestamps: false },
);

// Auto-purge expired tokens
VerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
VerificationTokenSchema.index({ userId: 1, type: 1 });

export const VerificationToken: Model<IVerificationToken> =
  mongoose.models.VerificationToken ||
  mongoose.model<IVerificationToken>(
    "VerificationToken",
    VerificationTokenSchema,
  );

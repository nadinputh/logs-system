import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPreAuthToken extends Document {
  token: string;
  userId: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
}

const PreAuthTokenSchema = new Schema<IPreAuthToken>(
  {
    token: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Auto-expire documents after expiresAt
PreAuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PreAuthToken: Model<IPreAuthToken> =
  mongoose.models.PreAuthToken ||
  mongoose.model<IPreAuthToken>("PreAuthToken", PreAuthTokenSchema);

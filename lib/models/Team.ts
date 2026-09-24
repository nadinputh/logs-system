import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type TeamPlatformStatus = "active" | "suspended";

export interface ITeam extends Document {
  name: string;
  slug: string;
  ownerUserId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
  /** Superadmin kill switch — checked in middleware above even team context.
   *  Distinct from a Subscription's billing status: a team can be suspended
   *  (ToS) regardless of whether it's paid up. */
  platformStatus: TeamPlatformStatus;
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    platformStatus: { type: String, enum: ["active", "suspended"], default: "active" },
  },
  { timestamps: true },
);

TeamSchema.index({ ownerUserId: 1 });
TeamSchema.index({ createdByUserId: 1 });

export const Team: Model<ITeam> =
  mongoose.models.Team || mongoose.model<ITeam>("Team", TeamSchema);

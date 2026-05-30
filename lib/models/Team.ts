import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ITeam extends Document {
  name: string;
  slug: string;
  ownerUserId: Types.ObjectId;
  createdByUserId: Types.ObjectId;
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
  },
  { timestamps: true },
);

TeamSchema.index({ ownerUserId: 1 });
TeamSchema.index({ createdByUserId: 1 });

export const Team: Model<ITeam> =
  mongoose.models.Team || mongoose.model<ITeam>("Team", TeamSchema);

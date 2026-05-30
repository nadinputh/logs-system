import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IFloor extends Document {
  teamId: Types.ObjectId;
  buildingId: Types.ObjectId;
  number: number;
  name: string;
  description?: string;
  checkInMode: "click" | "passkey";
  createdAt: Date;
  updatedAt: Date;
}

const FloorSchema = new Schema<IFloor>(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    buildingId: {
      type: Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    number: { type: Number, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    checkInMode: { type: String, enum: ["click", "passkey"], default: "click" },
  },
  { timestamps: true },
);

FloorSchema.index({ teamId: 1, buildingId: 1, number: 1 }, { unique: true });

if (
  mongoose.models.Floor &&
  (!mongoose.models.Floor.schema.path("checkInMode") ||
    !mongoose.models.Floor.schema.path("teamId"))
) {
  delete mongoose.models.Floor;
}

export const Floor: Model<IFloor> =
  mongoose.models.Floor || mongoose.model<IFloor>("Floor", FloorSchema);

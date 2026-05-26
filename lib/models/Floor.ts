import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IFloor extends Document {
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

FloorSchema.index({ buildingId: 1, number: 1 }, { unique: true });

if (
  mongoose.models.Floor &&
  !mongoose.models.Floor.schema.path("checkInMode")
) {
  delete mongoose.models.Floor;
}

export const Floor: Model<IFloor> =
  mongoose.models.Floor || mongoose.model<IFloor>("Floor", FloorSchema);

import mongoose, { Schema, Document, Model } from "mongoose";

export type CheckInMode = "click" | "passkey";

export interface IBuilding extends Document {
  name: string;
  address: string;
  description?: string;
  checkInMode: CheckInMode;
  createdAt: Date;
  updatedAt: Date;
}

const BuildingSchema = new Schema<IBuilding>(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    checkInMode: { type: String, enum: ["click", "passkey"], default: "click" },
  },
  { timestamps: true },
);

if (
  mongoose.models.Building &&
  !mongoose.models.Building.schema.path("checkInMode")
) {
  delete mongoose.models.Building;
}

export const Building: Model<IBuilding> =
  mongoose.models.Building ||
  mongoose.model<IBuilding>("Building", BuildingSchema);

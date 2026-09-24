import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CheckInMode = "click" | "passkey";

export interface IBuilding extends Document {
  teamId: Types.ObjectId;
  name: string;
  address: string;
  description?: string;
  checkInMode: CheckInMode;
  /** Set by downgrade-prune when a team drops below a plan tier it has
   *  outgrown. Archived buildings and their rooms/floors/logs stay intact
   *  and readable but drop out of active check-in flows and creation limits —
   *  never deleted. */
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const BuildingSchema = new Schema<IBuilding>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    name: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    checkInMode: { type: String, enum: ["click", "passkey"], default: "click" },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

BuildingSchema.index({ teamId: 1, name: 1 });
BuildingSchema.index({ teamId: 1, isArchived: 1 });

if (
  mongoose.models.Building &&
  (!mongoose.models.Building.schema.path("checkInMode") ||
    !mongoose.models.Building.schema.path("teamId") ||
    !mongoose.models.Building.schema.path("isArchived"))
) {
  delete mongoose.models.Building;
}

export const Building: Model<IBuilding> =
  mongoose.models.Building ||
  mongoose.model<IBuilding>("Building", BuildingSchema);

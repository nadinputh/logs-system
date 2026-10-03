import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type CheckInMode = "click" | "passkey";

export interface IGeofence {
  type: "Polygon";
  coordinates: number[][][];
}

export interface IBuilding extends Document {
  teamId: Types.ObjectId;
  name: string;
  address: string;
  description?: string;
  checkInMode: CheckInMode;
  requireDynamicQr?: boolean;
  geofence?: IGeofence | null;
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
    requireDynamicQr: { type: Boolean, default: false },
    // Admin-drawn boundary used to validate check-in coordinates server-side
    // (see app/api/logs/route.ts). Optional — buildings without one simply
    // never get a geofenceStatus computed on their logs.
    geofence: {
      type: { type: String, enum: ["Polygon"] },
      coordinates: { type: [[[Number]]] },
    },
  },
  { timestamps: true },
);

BuildingSchema.index({ teamId: 1, name: 1 });
BuildingSchema.index({ geofence: "2dsphere" });

if (
  mongoose.models.Building &&
  (!mongoose.models.Building.schema.path("checkInMode") ||
    !mongoose.models.Building.schema.path("requireDynamicQr") ||
    !mongoose.models.Building.schema.path("teamId") ||
    !mongoose.models.Building.schema.path("geofence"))
) {
  delete mongoose.models.Building;
}

export const Building: Model<IBuilding> =
  mongoose.models.Building ||
  mongoose.model<IBuilding>("Building", BuildingSchema);

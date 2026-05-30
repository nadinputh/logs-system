import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IRoom extends Document {
  teamId: Types.ObjectId;
  floorId: Types.ObjectId;
  buildingId: Types.ObjectId;
  name: string;
  number: string;
  type?: string;
  capacity?: number;
  description?: string;
  checkInMode: "click" | "passkey";
  createdAt: Date;
  updatedAt: Date;
}

const RoomSchema = new Schema<IRoom>(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    floorId: {
      type: Schema.Types.ObjectId,
      ref: "Floor",
      required: true,
      index: true,
    },
    buildingId: {
      type: Schema.Types.ObjectId,
      ref: "Building",
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    number: { type: String, required: true, trim: true },
    type: { type: String, trim: true },
    capacity: { type: Number },
    description: { type: String, trim: true },
    checkInMode: { type: String, enum: ["click", "passkey"], default: "click" },
  },
  { timestamps: true },
);

RoomSchema.index({ teamId: 1, floorId: 1, number: 1 });
RoomSchema.index({ teamId: 1, buildingId: 1, number: 1 });

if (
  mongoose.models.Room &&
  (!mongoose.models.Room.schema.path("checkInMode") ||
    !mongoose.models.Room.schema.path("teamId"))
) {
  delete mongoose.models.Room;
}

export const Room: Model<IRoom> =
  mongoose.models.Room || mongoose.model<IRoom>("Room", RoomSchema);

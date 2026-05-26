import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IRoom extends Document {
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

if (mongoose.models.Room && !mongoose.models.Room.schema.path("checkInMode")) {
  delete mongoose.models.Room;
}

export const Room: Model<IRoom> =
  mongoose.models.Room || mongoose.model<IRoom>("Room", RoomSchema);

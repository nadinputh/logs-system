import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type LocationType = "building" | "floor" | "room";

export interface ILog extends Document {
  teamId: Types.ObjectId;
  locationId: Types.ObjectId;
  locationType: LocationType;
  userId?: Types.ObjectId;
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  visitorGender?: string;
  visitPurpose?: string;
  sessionToken: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  geofenceStatus?: boolean;
  action: "in" | "out";
  timestamp: Date;
  relatedLogId?: Types.ObjectId;
  autoCheckedOut?: boolean;
  passkeyVerified?: boolean;
  passkeyCredentialId?: string;
  photo?: string;
  questCardId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const LogSchema = new Schema<ILog>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    locationId: { type: Schema.Types.ObjectId, required: true },
    locationType: {
      type: String,
      enum: ["building", "floor", "room"],
      required: true,
    },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    visitorName: { type: String, trim: true },
    visitorEmail: { type: String, trim: true },
    visitorPhone: { type: String, trim: true },
    visitorGender: { type: String, trim: true },
    visitPurpose: { type: String, trim: true },
    sessionToken: { type: String, required: true },
    deviceId: { type: String },
    ipAddress: { type: String },
    userAgent: { type: String },
    geofenceStatus: { type: Boolean },
    action: { type: String, enum: ["in", "out"], required: true },
    timestamp: { type: Date, default: Date.now },
    relatedLogId: { type: Schema.Types.ObjectId, ref: "Log" },
    autoCheckedOut: { type: Boolean, default: false },
    passkeyVerified: { type: Boolean, default: false },
    passkeyCredentialId: { type: String },
    photo: { type: String, select: false },
    questCardId: { type: Schema.Types.ObjectId, ref: "QuestCard" },
  },
  { timestamps: true },
);

LogSchema.index({ teamId: 1, locationType: 1, locationId: 1, action: 1 });
LogSchema.index({ teamId: 1, timestamp: -1 });
LogSchema.index({ teamId: 1, relatedLogId: 1 });
LogSchema.index({ sessionToken: 1, action: 1 });
LogSchema.index({ userId: 1 });
LogSchema.index({ questCardId: 1 });
LogSchema.index({ timestamp: -1 });
LogSchema.index({ relatedLogId: 1 });

if (mongoose.models.Log && !mongoose.models.Log.schema.path("teamId")) {
  delete mongoose.models.Log;
}

export const Log: Model<ILog> =
  mongoose.models.Log || mongoose.model<ILog>("Log", LogSchema);

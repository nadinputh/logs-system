import mongoose, { Schema, Document, Model, Types } from "mongoose";
import { appendOnly } from "./appendOnly";

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
  /** Legacy: selfie capture was removed. Old documents may still carry a URL. */
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
    visitorName: { type: String, trim: true, maxlength: 100 },
    visitorEmail: { type: String, trim: true, maxlength: 254 },
    visitorPhone: { type: String, trim: true, maxlength: 30 },
    visitorGender: { type: String, trim: true, maxlength: 32 },
    visitPurpose: { type: String, trim: true, maxlength: 200 },
    sessionToken: { type: String, required: true, maxlength: 64 },
    deviceId: { type: String, maxlength: 64 },
    ipAddress: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 512 },
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
// A check-in can be closed once. Backstops the cron/manual/visitor checkout
// race, which the read-then-insert checks in each route cannot close alone.
LogSchema.index(
  { relatedLogId: 1 },
  {
    unique: true,
    // Explicit name: the plain { relatedLogId: 1 } index above auto-names to
    // the same string and the build fails with IndexKeySpecsConflict.
    name: "relatedLogId_out_unique",
    partialFilterExpression: { action: "out" },
  },
);

appendOnly(LogSchema, "Log");

if (mongoose.models.Log && !mongoose.models.Log.schema.path("teamId")) {
  delete mongoose.models.Log;
}

export const Log: Model<ILog> =
  mongoose.models.Log || mongoose.model<ILog>("Log", LogSchema);

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IPasskeyCheckInChallenge extends Document {
  challenge: string;
  teamId: string;
  locationId: string;
  locationType: string;
  action: "in" | "out";
  sessionToken: string;
  relatedLogId?: string;
  idempotencyKey: string;
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  visitorGender?: string;
  visitPurpose?: string;
  deviceId?: string;
  createdAt: Date;
}

const PasskeyCheckInChallengeSchema = new Schema<IPasskeyCheckInChallenge>(
  {
    challenge: { type: String, required: true, unique: true },
    teamId: { type: String, required: true },
    locationId: { type: String, required: true },
    locationType: { type: String, required: true },
    action: { type: String, enum: ["in", "out"], required: true },
    sessionToken: { type: String, required: true },
    relatedLogId: { type: String },
    idempotencyKey: { type: String, required: true },
    visitorName: { type: String, trim: true },
    visitorEmail: { type: String, trim: true },
    visitorPhone: { type: String, trim: true },
    visitorGender: { type: String, trim: true },
    visitPurpose: { type: String, trim: true },
    deviceId: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Auto-expire after 5 minutes
PasskeyCheckInChallengeSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 300 },
);
// Lookup index used during intent cleanup before creating a new challenge
PasskeyCheckInChallengeSchema.index({ teamId: 1, sessionToken: 1, action: 1 });

if (
  mongoose.models.PasskeyCheckInChallenge &&
  (!mongoose.models.PasskeyCheckInChallenge.schema.path("teamId") ||
    !mongoose.models.PasskeyCheckInChallenge.schema.path("deviceId"))
) {
  delete mongoose.models.PasskeyCheckInChallenge;
}

export const PasskeyCheckInChallenge: Model<IPasskeyCheckInChallenge> =
  mongoose.models.PasskeyCheckInChallenge ||
  mongoose.model<IPasskeyCheckInChallenge>(
    "PasskeyCheckInChallenge",
    PasskeyCheckInChallengeSchema,
  );

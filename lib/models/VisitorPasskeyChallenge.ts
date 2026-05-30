import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IVisitorPasskeyChallenge extends Document {
  teamId: Types.ObjectId;
  sessionToken: string;
  challenge: string;
  createdAt: Date;
}

const VisitorPasskeyChallengeSchema = new Schema<IVisitorPasskeyChallenge>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    sessionToken: { type: String, required: true },
    challenge: { type: String, required: true, unique: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Auto-expire after 5 minutes
VisitorPasskeyChallengeSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 300 },
);
VisitorPasskeyChallengeSchema.index({ teamId: 1, sessionToken: 1 });

if (
  mongoose.models.VisitorPasskeyChallenge &&
  !mongoose.models.VisitorPasskeyChallenge.schema.path("teamId")
) {
  delete mongoose.models.VisitorPasskeyChallenge;
}

export const VisitorPasskeyChallenge: Model<IVisitorPasskeyChallenge> =
  mongoose.models.VisitorPasskeyChallenge ||
  mongoose.model<IVisitorPasskeyChallenge>(
    "VisitorPasskeyChallenge",
    VisitorPasskeyChallengeSchema,
  );

import mongoose, { Schema, Document, Model } from "mongoose";

export interface IVisitorPasskeyChallenge extends Document {
  sessionToken: string;
  challenge: string;
  createdAt: Date;
}

const VisitorPasskeyChallengeSchema = new Schema<IVisitorPasskeyChallenge>(
  {
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
VisitorPasskeyChallengeSchema.index({ sessionToken: 1 });

export const VisitorPasskeyChallenge: Model<IVisitorPasskeyChallenge> =
  mongoose.models.VisitorPasskeyChallenge ||
  mongoose.model<IVisitorPasskeyChallenge>(
    "VisitorPasskeyChallenge",
    VisitorPasskeyChallengeSchema,
  );

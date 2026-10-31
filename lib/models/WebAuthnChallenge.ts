import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IWebAuthnChallenge extends Document {
  userId: Types.ObjectId;
  // Opaque handle the client echoes back. Login never exposes a user id.
  ceremonyId?: string;
  challenge: string;
  type: "registration" | "authentication";
  createdAt: Date;
}

const WebAuthnChallengeSchema = new Schema<IWebAuthnChallenge>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ceremonyId: { type: String },
    challenge: { type: String, required: true },
    type: {
      type: String,
      enum: ["registration", "authentication"],
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Auto-expire after 5 minutes
WebAuthnChallengeSchema.index({ createdAt: 1 }, { expireAfterSeconds: 300 });
WebAuthnChallengeSchema.index({ userId: 1, type: 1 });
WebAuthnChallengeSchema.index({ ceremonyId: 1 }, { sparse: true });

export const WebAuthnChallenge: Model<IWebAuthnChallenge> =
  mongoose.models.WebAuthnChallenge ||
  mongoose.model<IWebAuthnChallenge>(
    "WebAuthnChallenge",
    WebAuthnChallengeSchema,
  );

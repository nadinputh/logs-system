import mongoose, { Schema, Document, Model } from "mongoose";

export interface IVisitorPasskeyCredential extends Document {
  sessionToken: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  visitorGender?: string;
  visitPurpose?: string;
  lastUsedAt: Date;
  createdAt: Date;
}

const VisitorPasskeyCredentialSchema = new Schema<IVisitorPasskeyCredential>(
  {
    sessionToken: { type: String, required: true },
    credentialId: { type: String, required: true, unique: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, required: true, default: 0 },
    transports: [{ type: String }],
    visitorName: { type: String, trim: true },
    visitorEmail: { type: String, trim: true },
    visitorPhone: { type: String, trim: true },
    visitorGender: { type: String, trim: true },
    visitPurpose: { type: String, trim: true },
    lastUsedAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Auto-expire after 7 days
VisitorPasskeyCredentialSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 604800 },
);
VisitorPasskeyCredentialSchema.index({ sessionToken: 1 });

export const VisitorPasskeyCredential: Model<IVisitorPasskeyCredential> =
  mongoose.models.VisitorPasskeyCredential ||
  mongoose.model<IVisitorPasskeyCredential>(
    "VisitorPasskeyCredential",
    VisitorPasskeyCredentialSchema,
  );

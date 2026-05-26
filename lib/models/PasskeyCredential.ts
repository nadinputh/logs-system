import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPasskeyCredential extends Document {
  userId: Types.ObjectId;
  credentialId: string; // base64url-encoded
  publicKey: string; // COSE-encoded public key (base64url)
  counter: number;
  deviceType: string; // 'singleDevice' | 'multiDevice'
  backedUp: boolean;
  transports: string[];
  createdAt: Date;
  lastUsedAt: Date;
}

const PasskeyCredentialSchema = new Schema<IPasskeyCredential>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    credentialId: { type: String, required: true, unique: true },
    publicKey: { type: String, required: true },
    counter: { type: Number, required: true, default: 0 },
    deviceType: { type: String, default: "singleDevice" },
    backedUp: { type: Boolean, default: false },
    transports: [{ type: String }],
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

PasskeyCredentialSchema.index({ userId: 1 });

export const PasskeyCredential: Model<IPasskeyCredential> =
  mongoose.models.PasskeyCredential ||
  mongoose.model<IPasskeyCredential>(
    "PasskeyCredential",
    PasskeyCredentialSchema,
  );

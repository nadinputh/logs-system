import mongoose, { Schema, Document, Model, Types } from "mongoose";

/**
 * Per-JWT session record. A row per issued token so the "Active sessions"
 * surface can enumerate what the user is signed in on and revoke one row
 * without nuking the rest.
 *
 * The vault's own Log model records `ip_address`, `user_agent`, `device_id`
 * on every visitor punt; auditing visitors more strictly than we audit users
 * was the philosophical inversion the R3 session critique flagged. This
 * collection closes the gap without touching the append-only Log contract.
 *
 * Rows are written by the credentials/passkey `authorize` step (which owns
 * the request headers) and consulted by the jwt callback for existence
 * (revoked rows are gone by absence, not by a flag).
 */
export interface ISessionInventory extends Document {
  userId: Types.ObjectId;
  jti: string;
  createdAt: Date;
  lastSeenAt: Date;
  ipAddress: string;
  userAgent: string;
  provider: "credentials" | "passkey";
}

const SessionInventorySchema = new Schema<ISessionInventory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jti: { type: String, required: true, unique: true, index: true },
    lastSeenAt: { type: Date, default: () => new Date() },
    ipAddress: { type: String, default: "unknown" },
    userAgent: { type: String, default: "unknown" },
    provider: { type: String, enum: ["credentials", "passkey"], default: "credentials" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Compound index for the list query — sort user's rows newest-first cheaply.
SessionInventorySchema.index({ userId: 1, createdAt: -1 });

export const SessionInventory: Model<ISessionInventory> =
  (mongoose.models.SessionInventory as Model<ISessionInventory>) ||
  mongoose.model<ISessionInventory>("SessionInventory", SessionInventorySchema);

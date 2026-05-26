import mongoose, { Schema, Document, Model } from "mongoose";

export interface IIdempotencyKey extends Document {
  key: string;
  statusCode: number;
  body: string;
  createdAt: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>(
  {
    key: { type: String, required: true, unique: true },
    statusCode: { type: Number, required: true },
    body: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

// Auto-expire after 24 hours
IdempotencyKeySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });

export const IdempotencyKey: Model<IIdempotencyKey> =
  mongoose.models.IdempotencyKey ||
  mongoose.model<IIdempotencyKey>("IdempotencyKey", IdempotencyKeySchema);

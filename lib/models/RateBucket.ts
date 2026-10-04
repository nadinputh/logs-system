import mongoose, { Schema, Model } from "mongoose";

interface IRateBucket {
  key: string;
  count: number;
  expireAt: Date;
}

const RateBucketSchema = new Schema<IRateBucket>({
  key: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  expireAt: { type: Date, required: true },
});

RateBucketSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const RateBucket: Model<IRateBucket> =
  mongoose.models.RateBucket ||
  mongoose.model<IRateBucket>("RateBucket", RateBucketSchema);

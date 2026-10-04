import mongoose, { Schema, Model } from "mongoose";

interface ICheckInLock {
  key: string;
  createdAt: Date;
}

const CheckInLockSchema = new Schema<ICheckInLock>({
  key: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

// Safety net only: a lock is released as soon as its request ends. If the
// process dies mid-request the TTL monitor (runs about every minute) frees it.
CheckInLockSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 });

export const CheckInLock: Model<ICheckInLock> =
  mongoose.models.CheckInLock ||
  mongoose.model<ICheckInLock>("CheckInLock", CheckInLockSchema);

import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IPushSubscription extends Document {
  userId: Types.ObjectId;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    endpoint: { type: String, required: true, unique: true },
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  { timestamps: true },
);

PushSubscriptionSchema.index({ userId: 1 });

export const PushSubscription: Model<IPushSubscription> =
  mongoose.models.PushSubscription ||
  mongoose.model<IPushSubscription>("PushSubscription", PushSubscriptionSchema);

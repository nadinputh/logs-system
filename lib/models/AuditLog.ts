import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IAuditLog extends Document {
  logId: Types.ObjectId;
  modifiedByUserId: Types.ObjectId;
  field: string;
  originalValue: string;
  newValue: string;
  reasonForChange: string;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    logId: { type: Schema.Types.ObjectId, ref: "Log", required: true },
    modifiedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    field: { type: String, required: true },
    originalValue: { type: String, required: true },
    newValue: { type: String, required: true },
    reasonForChange: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

AuditLogSchema.index({ logId: 1 });
AuditLogSchema.index({ modifiedByUserId: 1 });
AuditLogSchema.index({ timestamp: -1 });

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

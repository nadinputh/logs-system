import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IAuditLog extends Document {
  teamId: Types.ObjectId;
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
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
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

AuditLogSchema.index({ teamId: 1, timestamp: -1 });
AuditLogSchema.index({ logId: 1 });
AuditLogSchema.index({ modifiedByUserId: 1 });
AuditLogSchema.index({ timestamp: -1 });

if (
  mongoose.models.AuditLog &&
  !mongoose.models.AuditLog.schema.path("teamId")
) {
  delete mongoose.models.AuditLog;
}

export const AuditLog: Model<IAuditLog> =
  mongoose.models.AuditLog ||
  mongoose.model<IAuditLog>("AuditLog", AuditLogSchema);

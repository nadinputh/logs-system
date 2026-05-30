import mongoose, { Schema, Document, Model, Types } from "mongoose";

export type TeamRole = "owner" | "admin" | "manager" | "member" | "auditor";
export type TeamMemberStatus = "active" | "invited" | "suspended";

export interface ITeamMember extends Document {
  teamId: Types.ObjectId;
  userId: Types.ObjectId;
  role: TeamRole;
  status: TeamMemberStatus;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TeamMemberSchema = new Schema<ITeamMember>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: {
      type: String,
      enum: ["owner", "admin", "manager", "member", "auditor"],
      required: true,
      default: "member",
    },
    status: {
      type: String,
      enum: ["active", "invited", "suspended"],
      required: true,
      default: "active",
    },
    joinedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

TeamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });
TeamMemberSchema.index({ userId: 1, status: 1 });
TeamMemberSchema.index({ teamId: 1, role: 1, status: 1 });

export const TeamMember: Model<ITeamMember> =
  mongoose.models.TeamMember ||
  mongoose.model<ITeamMember>("TeamMember", TeamMemberSchema);

import mongoose, { Schema, Document, Model, Types } from "mongoose";
import type { TeamRole } from "./TeamMember";

export type TeamInviteStatus = "pending" | "accepted" | "revoked";

export interface ITeamInvite extends Document {
  teamId: Types.ObjectId;
  email: string;
  role: TeamRole;
  invitedByUserId: Types.ObjectId;
  token: string;
  status: TeamInviteStatus;
  expiresAt: Date;
  createdAt: Date;
}

const TeamInviteSchema = new Schema<ITeamInvite>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    role: {
      type: String,
      enum: ["owner", "admin", "manager", "member", "auditor"],
      required: true,
      default: "member",
    },
    invitedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    /**
     * The SHA-256 hash of the invite token, never the token itself. An invite is
     * a seven-day bearer credential — whoever holds one joins the team — so the
     * same argument lib/verification.ts makes for verification tokens applies
     * with more force here. The plaintext exists only inside the POST that mints
     * it, long enough to build the link and return it once.
     */
    token: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "revoked"],
      required: true,
      default: "pending",
    },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

TeamInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
TeamInviteSchema.index({ teamId: 1, email: 1, status: 1 });

export const TeamInvite: Model<ITeamInvite> =
  mongoose.models.TeamInvite ||
  mongoose.model<ITeamInvite>("TeamInvite", TeamInviteSchema);

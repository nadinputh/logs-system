import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash?: string;
  role: "admin" | "staff";
  activeTeamId?: Types.ObjectId;
  emailVerified?: Date | null;
  /**
   * Monotonic counter of session invalidations for this user. Bumped by
   * password reset, and by the "sign out other devices" control. Every JWT
   * stamps the value it was minted at; the jwt callback rejects any token
   * whose stamp is below the current value.
   *
   * This is the revocation channel a JWT strategy otherwise lacks: without it,
   * a lost phone stays signed in for 30 days and no admin action can end it.
   */
  sessionsVersion: number;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String }, // absent until set (admin-created accounts use a set-password link)
    role: { type: String, enum: ["admin", "staff"], default: "staff" },
    activeTeamId: { type: Schema.Types.ObjectId, ref: "Team" },
    emailVerified: { type: Date, default: null }, // null until email is verified; login is blocked while null
    sessionsVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

UserSchema.index({ activeTeamId: 1 });

export const User: Model<IUser> =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

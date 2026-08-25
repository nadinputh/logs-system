import { v4 as uuidv4 } from "uuid";
import { Types } from "mongoose";
import {
  VerificationToken,
  VerificationTokenType,
} from "./models/VerificationToken";

// Both email-verification and set-password links expire 1 hour after issuance.
export const VERIFICATION_TTL_MS = 60 * 60 * 1000;

/**
 * Issues a single-use verification token. Any prior tokens of the same type for
 * the user are removed so only the most recent link is valid.
 */
export async function issueVerificationToken(
  userId: Types.ObjectId | string,
  email: string,
  type: VerificationTokenType,
): Promise<string> {
  await VerificationToken.deleteMany({ userId, type });
  const token = uuidv4();
  await VerificationToken.create({
    token,
    userId,
    email: email.toLowerCase(),
    type,
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });
  return token;
}

const baseUrl = () => process.env.NEXTAUTH_URL ?? "http://localhost:3000";

export function verifyEmailLink(token: string) {
  return `${baseUrl()}/verify/${token}`;
}

export function setPasswordLink(token: string) {
  return `${baseUrl()}/set-password/${token}`;
}

export function inviteLink(token: string) {
  return `${baseUrl()}/invite/${token}`;
}

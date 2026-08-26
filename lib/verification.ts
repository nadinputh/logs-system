import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { Types } from "mongoose";
import {
  VerificationToken,
  VerificationTokenType,
} from "./models/VerificationToken";

// Both email-verification and set-password links expire 1 hour after issuance.
export const VERIFICATION_TTL_MS = 60 * 60 * 1000;

/**
 * Verification links are bearer credentials: whoever holds one can verify an
 * email or set a password. Storing them in plaintext meant anyone with read
 * access to the collection — a backup, a log, an analytics connector — held
 * live account-takeover links. Only the hash is persisted; the plaintext exists
 * just long enough to be put in the email.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a single-use verification token. Any prior tokens of the same type for
 * the user are removed so only the most recent link is valid. Returns the
 * plaintext for the link; the database only ever sees its hash.
 */
export async function issueVerificationToken(
  userId: Types.ObjectId | string,
  email: string,
  type: VerificationTokenType,
): Promise<string> {
  await VerificationToken.deleteMany({ userId, type });
  const token = uuidv4();
  await VerificationToken.create({
    token: hashToken(token),
    userId,
    email: email.toLowerCase(),
    type,
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
  });
  return token;
}

/**
 * These links are the only way into a new account, so a wrong host is a dead
 * end. next.config.mjs already derives the app URL from PORT; this used to
 * hardcode :3000 while the project runs on :4242 and next.config defaults to
 * :4000 — three different answers to one question.
 */
const baseUrl = () =>
  process.env.NEXTAUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  `http://localhost:${process.env.PORT ?? "4000"}`;

export function verifyEmailLink(token: string) {
  return `${baseUrl()}/verify/${token}`;
}

export function setPasswordLink(token: string) {
  return `${baseUrl()}/set-password/${token}`;
}

export function inviteLink(token: string) {
  return `${baseUrl()}/invite/${token}`;
}

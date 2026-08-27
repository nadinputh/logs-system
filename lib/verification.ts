import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { Types } from "mongoose";
import {
  VerificationToken,
  VerificationTokenType,
} from "./models/VerificationToken";

// Email-verification links expire 1 hour after issuance: the user just asked for
// one and is watching their inbox.
export const VERIFICATION_TTL_MS = 60 * 60 * 1000;

/**
 * Set-password links get seven days, not one hour.
 *
 * The recipient never asked for this account — an admin provisioned it — so they
 * are the least likely of anyone to be watching their inbox, and a one-hour
 * window expired routinely before they ever opened it. Every exit was then
 * sealed: sign-in fails (no passwordHash), there is no forgot-password route,
 * "resend the verification email" issues the wrong token type, and both the
 * invite and re-create paths 409.
 *
 * Seven days is not weaker than what it replaces: possession of the link proves
 * control of the address, exactly as the seven-day team invite it duplicates.
 */
export const SET_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Password-reset links get 1 hour, not 7 days.
 *
 * The recipient asked for the link (unlike set-password, which arrives cold),
 * so they are actively watching their inbox — a long window buys nothing and
 * lets a stolen bearer credential linger. Same TTL as email verification for
 * the same reason.
 */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const ttlFor = (type: VerificationTokenType) =>
  type === "set_password"
    ? SET_PASSWORD_TTL_MS
    : type === "password_reset"
      ? PASSWORD_RESET_TTL_MS
      : VERIFICATION_TTL_MS;

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
): Promise<{ token: string; expiresAt: Date }> {
  await VerificationToken.deleteMany({ userId, type });
  const token = uuidv4();
  const expiresAt = new Date(Date.now() + ttlFor(type));
  await VerificationToken.create({
    token: hashToken(token),
    userId,
    email: email.toLowerCase(),
    type,
    expiresAt,
  });
  return { token, expiresAt };
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

export function resetPasswordLink(token: string) {
  return `${baseUrl()}/reset-password/${token}`;
}

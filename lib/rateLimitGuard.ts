import { NextResponse } from "next/server";
import { clientKey } from "@/lib/rateLimit";
import { rateLimitShared } from "@/lib/rateLimitShared";
import { createHash } from "crypto";
import { Types } from "mongoose";

/**
 * Per-IP shared limiter for unauthenticated routes. Returns the 429 to send, or
 * null to proceed. Shared (MongoDB-backed) so it holds across instances.
 */
export async function limitByIp(
  req: Request,
  scope: string,
  limit: number,
  windowMs = 60_000,
): Promise<NextResponse | null> {
  const verdict = await rateLimitShared(clientKey(req, scope), limit, windowMs);
  if (verdict.ok) return null;
  return NextResponse.json(
    { error: "Too many requests" },
    { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
  );
}

/**
 * Per-target-email cap on account mail (register, resend, reset). The per-IP
 * limit alone lets many addresses each send a few, so one victim could be
 * mail-bombed, or have a pending sign-up reset over and over. Silent by design:
 * callers stay neutral and simply skip the send. The address is hashed so it is
 * not stored in the limiter collection.
 */
export async function mailAllowed(
  email: string,
  purpose: "signup" | "resend" | "reset" | "invite" | "provision" = "signup",
  requester = "-",
): Promise<boolean> {
  const h = createHash("sha256").update(email.toLowerCase()).digest("hex").slice(0, 32);
  // Two gates. Per (address, requester): a caller cannot spend the address
  // owner's allowance, since the owner asks from a different requester. And a
  // generous per-address ceiling that only a distributed flood reaches. One
  // bucket per purpose, so flooding one kind of mail cannot starve another.
  const mine = await rateLimitShared(`mail:${purpose}:${h}:${requester}`, 3, 60 * 60_000);
  if (!mine.ok) return false;
  return (await rateLimitShared(`mail:${purpose}:${h}`, 20, 60 * 60_000)).ok;
}

/**
 * Hourly cap on how much account mail one signed-in admin can cause (invites,
 * provisioned users, set-password resends). Any sign-up owns a team, so without
 * this every account is a mail relay from the app's domain. Returns the 429 to
 * send, or null to proceed.
 */
export async function actorMailLimit(
  actorId: string,
  ip = "-",
): Promise<NextResponse | null> {
  // A brand-new account has no history, and any sign-up owns a team, so a fresh
  // account gets a small budget until it is a day old (the age is the ObjectId's
  // own timestamp, no lookup needed). A per-IP ceiling bounds many fresh accounts
  // driven from one place.
  const ageMs = Types.ObjectId.isValid(actorId)
    ? Date.now() - new Types.ObjectId(actorId).getTimestamp().getTime()
    : Infinity;
  const perActor = ageMs < 24 * 60 * 60_000 ? 5 : 30;
  const [actor, byIp] = await Promise.all([
    rateLimitShared(`mail-actor:${actorId}`, perActor, 60 * 60_000),
    rateLimitShared(`mail-actor-ip:${ip}`, 60, 60 * 60_000),
  ]);
  const verdict = !actor.ok ? actor : byIp;
  if (verdict.ok) return null;
  return NextResponse.json(
    { error: "Too many invitations sent. Try again later." },
    { status: 429, headers: { "Retry-After": String(verdict.retryAfter) } },
  );
}

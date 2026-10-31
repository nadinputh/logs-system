import { NextResponse } from "next/server";
import { SessionInventory } from "@/lib/models/SessionInventory";

const FRESH_MS = 30 * 60 * 1000;

/**
 * Step-up for credential changes. A passkey outlives "sign out everywhere" and
 * mints brand-new sessions, so adding or removing one must prove a recent
 * sign-in rather than ride a possibly stolen, long-lived cookie. The sign-in
 * time is the session inventory row's creation time. Returns the 403 to send,
 * or null when the current session signed in within the last 30 minutes.
 */
export async function requireRecentSignIn(
  sid: string | undefined,
): Promise<NextResponse | null> {
  const row = sid
    ? await SessionInventory.findOne({ jti: sid }).select("createdAt").lean<{ createdAt?: Date } | null>()
    : null;
  if (row?.createdAt && Date.now() - row.createdAt.getTime() < FRESH_MS) return null;
  return NextResponse.json(
    {
      code: "REAUTH_REQUIRED",
      error: "For your security, sign out and sign back in before changing passkeys.",
    },
    { status: 403 },
  );
}

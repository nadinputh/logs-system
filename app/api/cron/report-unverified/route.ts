import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { readSecret } from "@/lib/secrets";

export const runtime = "nodejs";

const STALE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

const sha = (s: string) => createHash("sha256").update(s).digest();

/**
 * REPORT ONLY. Counts sign-ups that never verified their address and are older
 * than 14 days, so the owner can decide a retention policy from real numbers.
 * It deletes nothing: removing accounts (and the empty team each one created) is
 * a destructive choice that has not been made.
 */
export async function GET(req: NextRequest) {
  // Fail closed: with no secret configured, an absent header must not match.
  const expected = readSecret("CRON_SECRET");
  const given = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!expected || !timingSafeEqual(sha(given), sha(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const [stale, withoutPassword] = await Promise.all([
    User.countDocuments({ emailVerified: null, createdAt: { $lt: cutoff } }),
    User.countDocuments({
      emailVerified: null,
      passwordHash: { $exists: false },
      createdAt: { $lt: cutoff },
    }),
  ]);

  console.info(
    `[cron] unverified accounts older than 14 days: ${stale} (${withoutPassword} with no password set)`,
  );
  return NextResponse.json({ staleUnverified: stale, withoutPassword, olderThanDays: 14 });
}

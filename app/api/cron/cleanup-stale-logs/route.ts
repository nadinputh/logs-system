import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { AuditLog } from "@/lib/models/AuditLog";
import { publishLogCreated } from "@/lib/realtime/logEvents";
import { checkoutFields } from "@/lib/checkoutLog";

export const runtime = "nodejs";

const HOUR = 60 * 60 * 1000;
const STALE_AFTER_MS = 12 * HOUR;
// Bounds the scan so it does not grow with the whole history. Check-ins older
// than this that are still open (a multi-week outage) are left for an admin,
// and reported by the stranded check at the end of the run.
const LOOKBACK_MS = 30 * 24 * HOUR;
const BATCH = 500;
const MAX_BATCHES = 10;

function sha(s: string) {
  return createHash("sha256").update(s).digest();
}

export async function GET(req: NextRequest) {
  // Fail closed: with no secret configured, an absent header must not match.
  const expected = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";
  if (!expected || !timingSafeEqual(sha(given), sha(expected))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  const now = Date.now();

  // Open check-ins: older than 12h, no `out` pointing at them. Uses the
  // relatedLogId index for the join. `from`/`to` bound the age window.
  const findOpen = (from: Date | null, to: Date, limit: number) =>
    Log.aggregate([
      {
        $match: {
          teamId: { $exists: true },
          action: "in",
          timestamp: from ? { $lt: to, $gte: from } : { $lt: to },
        },
      },
      { $sort: { timestamp: 1 } },
      {
        $lookup: {
          from: Log.collection.name,
          localField: "_id",
          foreignField: "relatedLogId",
          as: "closers",
        },
      },
      { $match: { closers: { $not: { $elemMatch: { action: "out" } } } } },
      { $project: { closers: 0, photo: 0 } },
      { $limit: limit },
    ]);

  let cleaned = 0;
  let skipped = 0;

  // Drain in batches so a backlog above BATCH clears in one run instead of
  // BATCH per hour. MAX_BATCHES bounds the run; a short batch means done.
  for (let i = 0; i < MAX_BATCHES; i++) {
    const open = await findOpen(
      new Date(now - LOOKBACK_MS),
      new Date(now - STALE_AFTER_MS),
      BATCH,
    );

    for (const checkin of open) {
      try {
        // Append-only. Capped at check-in + 12h so a late or missed run does
        // not inflate the recorded duration.
        const out = await Log.create({
          ...checkoutFields(checkin),
          autoCheckedOut: true,
          timestamp: new Date(new Date(checkin.timestamp).getTime() + STALE_AFTER_MS),
        });

        await AuditLog.create({
          teamId: checkin.teamId,
          logId: checkin._id,
          field: "autoCheckout",
          originalValue: "open",
          newValue: out._id.toString(),
          reasonForChange: "Auto-checked out 12 hours after check-in (no checkout recorded)",
          timestamp: new Date(),
        });

        publishLogCreated(out);
        cleaned++;
      } catch (err: any) {
        // 11000: someone closed it between our read and write — nothing to do.
        if (err?.code !== 11000) {
          console.error("[cron] auto-checkout failed", checkin._id?.toString(), err);
        }
        skipped++;
      }
    }

    if (open.length < BATCH) break;
  }

  // Check-ins past the lookback are never auto-closed, so they would show as
  // "in" forever. Surface them for an admin rather than failing silently.
  const stranded = await findOpen(null, new Date(now - LOOKBACK_MS), 1);
  if (stranded.length) {
    console.warn("[cron] open check-ins older than the 30-day lookback need manual checkout");
  }

  // Notification pipeline v1: console. A webhook can hook in here.
  if (cleaned || skipped) {
    console.info(`[cron] auto-checkout: ${cleaned} closed, ${skipped} skipped`);
  }

  return NextResponse.json({ cleaned, skipped });
}

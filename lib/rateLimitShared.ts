import { connectDB } from "@/lib/db";
import { RateBucket } from "@/lib/models/RateBucket";
import type { RateVerdict } from "@/lib/rateLimit";

/**
 * Fixed-window limiter backed by MongoDB, so the count is shared by every
 * server instance (lib/rateLimit.ts is per-process). One atomic $inc per call.
 * Fails CLOSED on a database error: the limiter shares MongoDB with every
 * endpoint it guards, so when it cannot count, the endpoint behind it could not
 * have done its own work either, and failing open would turn any limiter outage
 * into an unthrottled window (password guessing, mail relay, bulk writes).
 * `failOpen` exists for a caller that must keep working without a count.
 */
export async function rateLimitShared(
  key: string,
  limit: number,
  windowMs: number,
  opts: { failOpen?: boolean } = {},
): Promise<RateVerdict> {
  const now = Date.now();
  const win = Math.floor(now / windowMs);
  const filter = { key: `${key}:${win}` };
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expireAt: new Date((win + 2) * windowMs) },
  };
  try {
    await connectDB();
    const query = { upsert: true, returnDocument: "after" } as const;
    const doc = await RateBucket.findOneAndUpdate(filter, update, query)
      .lean<{ count: number }>()
      // Two first hits can both try to insert; the loser's retry just increments.
      .catch(() => RateBucket.findOneAndUpdate(filter, update, query).lean<{ count: number }>());
    if (doc && doc.count > limit) {
      return { ok: false, retryAfter: Math.ceil(((win + 1) * windowMs - now) / 1000), window: win };
    }
  } catch (err) {
    console.error(`[rateLimitShared] failed ${opts.failOpen ? "open" : "closed"}`, err);
    if (!opts.failOpen) return { ok: false, retryAfter: 30 };
  }
  return { ok: true, window: win };
}

/**
 * Gives back one unit charged by rateLimitShared in the current window. Charging
 * up front is atomic (a concurrent burst cannot all pass a read-then-write
 * check); refunding on success makes a bucket count failures only, so successful
 * sign-ins from a shared address do not consume the budget. Best effort: a
 * failed refund just leaves the charge in place.
 */
export async function rateLimitRefund(
  key: string,
  windowMs: number,
  window?: number,
): Promise<void> {
  // Use the window that was charged when known: recomputing from the clock after
  // a slow step (bcrypt) can land in the next window and free a guess there.
  const win = window ?? Math.floor(Date.now() / windowMs);
  try {
    await connectDB();
    await RateBucket.updateOne({ key: `${key}:${win}`, count: { $gt: 0 } }, { $inc: { count: -1 } });
  } catch {
    // Leave the charge; the window expires on its own.
  }
}

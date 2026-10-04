import { connectDB } from "@/lib/db";
import { RateBucket } from "@/lib/models/RateBucket";
import type { RateVerdict } from "@/lib/rateLimit";

/**
 * Fixed-window limiter backed by MongoDB, so the count is shared by every
 * server instance (lib/rateLimit.ts is per-process). One atomic $inc per call.
 * Fails open on a database error: a limiter outage must not block check-ins.
 */
export async function rateLimitShared(
  key: string,
  limit: number,
  windowMs: number,
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
    const opts = { upsert: true, new: true } as const;
    const doc = await RateBucket.findOneAndUpdate(filter, update, opts)
      .lean<{ count: number }>()
      // Two first hits can both try to insert; the loser's retry just increments.
      .catch(() => RateBucket.findOneAndUpdate(filter, update, opts).lean<{ count: number }>());
    if (doc && doc.count > limit) {
      return { ok: false, retryAfter: Math.ceil(((win + 1) * windowMs - now) / 1000) };
    }
  } catch (err) {
    console.error("[rateLimitShared] failed open", err);
  }
  return { ok: true };
}

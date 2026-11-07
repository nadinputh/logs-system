import { connectDB } from "@/lib/db";
import { RateBucket } from "@/lib/models/RateBucket";
import { rateLimitRefund, rateLimitShared } from "@/lib/rateLimitShared";

/**
 * A cap on concurrent SSE streams per key that holds across server instances
 * (an in-process Map only counts the streams its own instance serves). A slot
 * is a unit charged in the shared limiter's window and refunded on close, so
 * `ttlMs` must be at least a stream's maximum life: if a process dies without
 * releasing, the window expires the charge on its own.
 *
 * A stream opened late in one window is still open in the next, so the live
 * count is the previous window's remaining charges plus the current window's.
 * Charging against `max` minus the previous window's count keeps the cap exact
 * across the boundary. (The previous window only shrinks, as streams close.)
 *
 * Returns the release function, or null when `key` already holds `max` streams.
 * Fails closed on a database error, like the limiter it is built on.
 */
export async function acquireStreamSlot(
  key: string,
  max: number,
  ttlMs: number,
): Promise<(() => void) | null> {
  let carried: number;
  try {
    await connectDB();
    const prev = await RateBucket.findOne({ key: `${key}:${Math.floor(Date.now() / ttlMs) - 1}` })
      .lean<{ count: number }>();
    carried = Math.max(0, prev?.count ?? 0);
  } catch {
    return null;
  }
  if (carried >= max) return null;

  const verdict = await rateLimitShared(key, max - carried, ttlMs);
  if (!verdict.ok) {
    // A refused attempt was still counted; give it back or it holds a phantom slot.
    if (verdict.window !== undefined) await rateLimitRefund(key, ttlMs, verdict.window);
    return null;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    void rateLimitRefund(key, ttlMs, verdict.window);
  };
}

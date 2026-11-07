import { rateLimitRefund, rateLimitShared } from "@/lib/rateLimitShared";

/**
 * A cap on concurrent SSE streams per key that holds across server instances
 * (an in-process Map only counts the streams its own instance serves). A slot
 * is a unit charged in the shared limiter's window and refunded on close, so
 * `ttlMs` must be at least a stream's maximum life: if a process dies without
 * releasing, the window expires the charge on its own.
 *
 * Returns the release function, or null when `key` already holds `max` streams.
 * Fails closed on a database error, like the limiter it is built on.
 */
export async function acquireStreamSlot(
  key: string,
  max: number,
  ttlMs: number,
): Promise<(() => void) | null> {
  const verdict = await rateLimitShared(key, max, ttlMs);
  if (!verdict.ok) return null;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    void rateLimitRefund(key, ttlMs, verdict.window);
  };
}

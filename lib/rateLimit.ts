/**
 * A small fixed-window limiter for the unauthenticated auth endpoints.
 *
 * These were entirely unthrottled: `POST /api/auth/register` creates a user
 * *and a team* per call, and `resend-verification` sends mail to any address
 * given — and its deliberately neutral response means abuse of it is invisible
 * in the API surface. One is resource exhaustion, the other is a way to send
 * mail to a third party from this domain.
 *
 * In-process and best-effort on purpose. It is not a distributed limiter and
 * will not hold across serverless instances; it raises the cost of casual abuse
 * from zero without pretending to be infrastructure. A real deployment should
 * put this at the edge — this is the floor, not the ceiling.
 */
type Bucket = { count: number; resetAt: number };

declare global {
  var _rateBuckets: Map<string, Bucket> | undefined;
}

const buckets = (): Map<string, Bucket> =>
  (global._rateBuckets ??= new Map<string, Bucket>());

export type RateVerdict = { ok: true } | { ok: false; retryAfter: number };

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateVerdict {
  const now = Date.now();
  const map = buckets();

  // Opportunistic sweep so the map cannot grow without bound from one-off keys.
  if (map.size > 5_000) {
    for (const [k, b] of map) if (b.resetAt <= now) map.delete(k);
  }

  const existing = map.get(key);
  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  existing.count += 1;
  return { ok: true };
}

/** Best-effort client identity for limiting. Falls back to a shared bucket. */
export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

/**
 * Shared types and key helpers for the rate limiters. The limiter itself is
 * MongoDB-backed (lib/rateLimitShared.ts) so counts hold across serverless
 * instances; an in-process counter would reset per instance and was removed.
 */
import { getClientIp, ipBucket } from "@/lib/server/getClientIp";

// `window` is the window index that was charged, so a later refund can target the
// same bucket even if the clock has since crossed a boundary.
export type RateVerdict =
  | { ok: true; window?: number }
  | { ok: false; retryAfter: number; window?: number };

/** Best-effort client identity for limiting. Falls back to a shared bucket. */
export function clientKey(req: Request, scope: string): string {
  return `${scope}:${ipBucket(getClientIp(req))}`;
}

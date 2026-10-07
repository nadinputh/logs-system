/**
 * The client IP, from the one hop we can trust.
 *
 * `X-Forwarded-For` is a list each proxy APPENDS to, so everything before the
 * entries our own infrastructure added is attacker-controlled: taking the first
 * value lets any client pick its own IP (and its own rate-limit bucket). The
 * trustworthy entry is the one our nearest proxy appended, i.e. counted from
 * the END. `TRUSTED_PROXY_HOPS` is how many proxies sit in front of the app
 * (default 1: Vercel, or a single nginx/ALB). Behind a CDN plus a load
 * balancer set it to 2, or all clients collapse onto the balancer's IP.
 */
export function pickClientIp(
  forwardedFor: string | null | undefined,
  realIp?: string | null,
): string {
  const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);
  const parts = (forwardedFor ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length) return parts[Math.max(0, parts.length - hops)];
  return realIp?.trim() || "unknown";
}

export function getClientIp(req: { headers: Headers }): string {
  return pickClientIp(
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-real-ip"),
  );
}

/**
 * The client IP, from the one hop we can trust.
 *
 * `X-Forwarded-For` is a list each proxy APPENDS to, so everything before the
 * entries our own infrastructure added is attacker-controlled: taking the first
 * value lets any client pick its own IP (and its own rate-limit bucket). The
 * trustworthy entry is the one our nearest proxy appended, i.e. counted from
 * the END. `TRUSTED_PROXY_HOPS` is how many proxies sit in front of the app
 * (default 1: Cloudflare Tunnel, or a single nginx/ALB). Behind a CDN plus a load
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

/**
 * The key a rate limiter should use for an address. An IPv6 client controls a
 * whole /64 and can rotate within it for free, so per-IP buckets keyed on the
 * full address are bypassed; key on the /64 prefix instead. IPv4 (and
 * IPv4-mapped IPv6) is unchanged. Audit fields keep the full address.
 */
export function ipBucket(raw: string): string {
  // Some proxies append the client's source port ("1.2.3.4:5678", "[2001:db8::1]:5678"):
  // that would give every connection its own bucket.
  const ip = raw.replace(/^\[([^\]]+)\](?::\d+)?$/, "$1").replace(/^(\d+\.\d+\.\d+\.\d+):\d+$/, "$1");
  // IPv4, and IPv4-mapped IPv6 in any spelling (::ffff:1.2.3.4, 0:0:0:0:0:ffff:1.2.3.4):
  // bucket on the IPv4 address itself.
  const quad = ip.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (quad) return quad[1];
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b]
    : a;
  return groups.slice(0, 4).map((g) => g.padStart(4, "0")).join(":") + "::/64";
}

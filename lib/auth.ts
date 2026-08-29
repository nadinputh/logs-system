import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { connectDB } from "./db";
import { User } from "./models/User";
import { PreAuthToken } from "./models/PreAuthToken";
import { SessionInventory } from "./models/SessionInventory";
import { rateLimit } from "./rateLimit";

/**
 * Read-through cache for the User.sessionsVersion column.
 *
 * The jwt callback checks it on every request. A raw DB read there would be a
 * query per request; a 60-second cache buys "compromised session dies within a
 * minute" while keeping the steady-state cost near zero.
 */
type SvEntry = { value: number; expiresAt: number };
declare global {
  var _svCache: Map<string, SvEntry> | undefined;
  var _svCachePending: Map<string, Promise<number | null>> | undefined;
}
const SV_CACHE_TTL_MS = 60_000;

function readSessionVersionCached(userId: string): number | null {
  const now = Date.now();
  const cache = (global._svCache ??= new Map());
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > now) return hit.value;

  // Kick off a refresh but do NOT await here — the jwt callback stays sync-fast
  // in the steady state, and a cold cache accepts the current token once
  // before invalidating. That's the acceptable failure mode: at most one
  // stale-token request per userId per TTL window per process.
  const pending = (global._svCachePending ??= new Map());
  if (!pending.has(userId)) {
    pending.set(
      userId,
      User.findById(userId)
        .select("sessionsVersion")
        .lean<{ sessionsVersion?: number } | null>()
        .then((row) => {
          const value = row?.sessionsVersion ?? 0;
          cache.set(userId, { value, expiresAt: Date.now() + SV_CACHE_TTL_MS });
          return value;
        })
        .catch(() => null)
        .finally(() => pending.delete(userId)),
    );
  }
  return hit?.value ?? null;
}

/**
 * Per-JTI existence cache. The jwt callback needs a cheap way to answer
 * "does this token still have an inventory row?" without querying Mongo per
 * request. Same 60s window as sessionsVersion — a revoked session dies within
 * a minute across every process.
 *
 * `null` cached means "we asked, it wasn't there". `true` means "confirmed
 * present at cache time". Cold-cache reads accept the token once while the
 * refresh completes; that's the same trade sessionsVersion makes.
 */
type JtiEntry = { present: boolean; expiresAt: number };
declare global {
  var _jtiCache: Map<string, JtiEntry> | undefined;
  var _jtiCachePending: Map<string, Promise<boolean>> | undefined;
  var _jtiLastTouch: Map<string, number> | undefined;
}
const JTI_CACHE_TTL_MS = 60_000;
const JTI_TOUCH_MIN_INTERVAL_MS = 5 * 60_000;

function isJtiPresentCached(sid: string): boolean | null {
  const now = Date.now();
  const cache = (global._jtiCache ??= new Map());
  const hit = cache.get(sid);
  if (hit && hit.expiresAt > now) return hit.present;
  const pending = (global._jtiCachePending ??= new Map());
  if (!pending.has(sid)) {
    pending.set(
      sid,
      SessionInventory.exists({ jti: sid })
        .then((doc) => {
          const present = !!doc;
          cache.set(sid, { present, expiresAt: Date.now() + JTI_CACHE_TTL_MS });
          return present;
        })
        .catch(() => false)
        .finally(() => pending.delete(sid)),
    );
  }
  return hit?.present ?? null;
}

function invalidateJtiCache(sid: string) {
  (global._jtiCache ??= new Map()).delete(sid);
}

/**
 * Best-effort lastSeenAt touch. Every jwt decode fires this, so it MUST be
 * throttled — otherwise every request writes to Mongo. 5-minute intervals per
 * JTI in-process keep the inventory close to real without hammering.
 */
function touchSessionSeen(sid: string) {
  const now = Date.now();
  const touch = (global._jtiLastTouch ??= new Map());
  const last = touch.get(sid) ?? 0;
  if (now - last < JTI_TOUCH_MIN_INTERVAL_MS) return;
  touch.set(sid, now);
  SessionInventory.updateOne({ jti: sid }, { $set: { lastSeenAt: new Date() } }).catch(
    () => {
      // Non-fatal; the row will just show a stale lastSeenAt on the next fetch.
    },
  );
}

export function forgetJtiCache(sid: string) {
  invalidateJtiCache(sid);
  (global._jtiLastTouch ??= new Map()).delete(sid);
}

/**
 * Bumps User.sessionsVersion and invalidates the read-through cache so the
 * next JWT decode picks up the new value. Called by password reset and by the
 * "sign out other devices" control.
 */
export async function bumpSessionsVersion(userId: string): Promise<number> {
  await connectDB();
  const doc = await User.findByIdAndUpdate(
    userId,
    { $inc: { sessionsVersion: 1 } },
    { new: true, projection: { sessionsVersion: 1 } },
  ).lean<{ sessionsVersion?: number } | null>();
  const value = doc?.sessionsVersion ?? 0;
  (global._svCache ??= new Map()).set(userId, {
    value,
    expiresAt: Date.now() + SV_CACHE_TTL_MS,
  });
  // Every caller of this ("sign out everywhere", password reset) means
  // "invalidate every session on this user". Delete the inventory rows too so
  // the "Active sessions" surface reflects the truth immediately, not just
  // once each stale token happens to hit a request.
  try {
    await SessionInventory.deleteMany({ userId });
  } catch {
    // Non-fatal; the sessionsVersion gate still evicts every token on its
    // next decode. Rows will look stale until a subsequent write clears them.
  }
  // Clear per-JTI caches for this user's rows; we don't have the list of JTIs
  // here, so drop the whole map — cheaper than tracking. Cold caches accept
  // once per JTI and then re-check.
  global._jtiCache = new Map();
  return value;
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    /**
     * The default is 30 days. Anything the JWT snapshots — role, team, and now
     * the sessions-version stamp — cannot outlast this window. 14 days keeps
     * the "signed in on my usual laptop for a fortnight" case and stops
     * indefinite lingering. Revocation via `sessionsVersion` closes the gap
     * for anything shorter than that.
     */
    maxAge: 14 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },
  providers: [
    CredentialsProvider({
      id: "credentials",
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        /**
         * The NextAuth credentials callback is the one auth surface no other
         * limiter here can see: it lives inside NextAuth's own handler and
         * doesn't pass through `app/api/auth/**` routes we own. Without a
         * check here, password guessing is unbounded — the credentials
         * endpoint has no ceiling, no lockout, no captcha.
         *
         * Two axes, either trips: an IP hammering many accounts
         * (credential-stuffing), and an email being pounded from many IPs
         * (targeted). Both throw `TOO_MANY_ATTEMPTS`, which the LoginForm
         * turns into a message the user can act on.
         */
        const fwd = req?.headers?.["x-forwarded-for"] ?? "";
        const ip =
          (Array.isArray(fwd) ? fwd[0] : String(fwd)).split(",")[0]?.trim() ||
          (req?.headers?.["x-real-ip"] as string | undefined) ||
          "unknown";
        const email = credentials.email.toLowerCase().trim();
        const perIp = rateLimit(`login:ip:${ip}`, 10, 15 * 60 * 1000);
        const perEmail = rateLimit(`login:email:${email}`, 5, 15 * 60 * 1000);
        if (!perIp.ok || !perEmail.ok) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        await connectDB();
        const user = await User.findOne({ email });
        if (!user) return null;
        // Snapshot request context now while we still have it — the jwt
        // callback runs later without a request object.
        const uaHeader = (req?.headers?.["user-agent"] as string | undefined) ?? "unknown";
        const originIp = ip;
        /**
         * An admin-provisioned account exists but has no password yet. Returning
         * null here collapsed it into the generic credential failure, so the user
         * was told their email and password "do not match an account" — for an
         * account that provably exists — and the resend control that would have
         * rescued them never rendered. Name the condition so the UI can offer the
         * one recovery that works for it.
         */
        if (!user.passwordHash) throw new Error("PASSWORD_NOT_SET");
        const valid = await bcrypt.compare(
          credentials.password,
          user.passwordHash,
        );
        if (!valid) return null;
        // Block sign-in until the email has been verified (set-password / verify link).
        if (!user.emailVerified) throw new Error("EMAIL_NOT_VERIFIED");

        // Mint a session id now so both the JWT and the inventory row share
        // the same opaque handle. We store it on `sid` because NextAuth's own
        // encoder calls `jose.SignJWT.setJti()` which overwrites any payload
        // `jti` we set — the token then reaches the client stamped with a
        // NextAuth-generated jti that has no matching inventory row, and the
        // revocation gate treats every request as revoked. `sid` sits outside
        // the JWT standard-claims namespace and survives round-trip. The
        // inventory column keeps the `jti` name because that's what it stores.
        const sid = randomUUID();
        try {
          await SessionInventory.create({
            userId: user._id,
            jti: sid,
            ipAddress: originIp,
            userAgent: uaHeader.slice(0, 512),
            provider: "credentials",
          });
        } catch {
          // Non-fatal: sign-in still succeeds if inventory write fails; the
          // per-JTI revocation gate treats missing rows as "unknown, allow
          // once per cache window" so a bad DB moment does not sign the user
          // out.
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          activeTeamId: user.activeTeamId?.toString() ?? null,
          sessionsVersion: user.sessionsVersion ?? 0,
          sid,
        } as any;
      },
    }),
    // Passkey bridge: exchanges a one-time pre-auth token (issued after FIDO2 verification) for a NextAuth session
    CredentialsProvider({
      id: "passkey-token",
      name: "Passkey",
      credentials: {
        preAuthToken: { type: "text" },
      },
      async authorize(credentials, req) {
        if (!credentials?.preAuthToken) return null;
        await connectDB();
        const tokenDoc = await PreAuthToken.findOneAndDelete({
          token: credentials.preAuthToken,
          expiresAt: { $gt: new Date() },
        });
        if (!tokenDoc) return null;
        const user = await User.findById(tokenDoc.userId);
        if (!user) return null;

        const fwd = req?.headers?.["x-forwarded-for"] ?? "";
        const ip =
          (Array.isArray(fwd) ? fwd[0] : String(fwd)).split(",")[0]?.trim() ||
          (req?.headers?.["x-real-ip"] as string | undefined) ||
          "unknown";
        const uaHeader =
          (req?.headers?.["user-agent"] as string | undefined) ?? "unknown";

        const sid = randomUUID();
        try {
          await SessionInventory.create({
            userId: user._id,
            jti: sid,
            ipAddress: ip,
            userAgent: uaHeader.slice(0, 512),
            provider: "passkey",
          });
        } catch {
          // See credentials branch above.
        }

        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          activeTeamId: user.activeTeamId?.toString() ?? null,
          sessionsVersion: user.sessionsVersion ?? 0,
          sid,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
        token.activeTeamId = (user as any).activeTeamId ?? null;
        (token as any).sv = (user as any).sessionsVersion ?? 0;
        (token as any).sid = (user as any).sid ?? null;
      }

      if (trigger === "update") {
        token.activeTeamId =
          (session as any)?.activeTeamId ?? token.activeTeamId ?? null;
      }

      /**
       * Revocation check.
       *
       * Two gates run every decode after the initial sign-in:
       *
       * 1. `sessionsVersion` — the nuclear switch. Bumped by password reset
       *    and by "Sign out everywhere". Every JWT stamps the value it was
       *    minted at; a token whose stamp is stale is dropped.
       *
       * 2. `jti` — the per-session switch. Each sign-in creates a row in
       *    SessionInventory; a per-row Revoke deletes that row, and the jwt
       *    callback drops any token whose jti is no longer present.
       *
       * Both are read through short-TTL in-process caches so the steady-state
       * cost stays near zero. 60 seconds is short enough that a lost phone
       * loses access quickly and long enough that a normal browse session
       * looks free. That is the same trade every JWT-strategy revocation
       * design has to make.
       */
      if (!user && token?.id) {
        const cachedSv = readSessionVersionCached(token.id as string);
        if (cachedSv !== null && cachedSv !== (token as any).sv) {
          // Stale — force sign-out on next server touch.
          return {} as any;
        }

        const sid = (token as any).sid as string | undefined;
        if (sid) {
          const present = isJtiPresentCached(sid);
          if (present === false) {
            // Row was revoked — end this session.
            return {} as any;
          }
          // Best-effort throttled touch so the inventory shows a real
          // lastSeenAt without writing on every request.
          touchSessionSeen(sid);
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
        (session.user as any).activeTeamId =
          (token as any).activeTeamId ?? null;
        (session.user as any).sid = (token as any).sid ?? null;
      }
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      // Explicit sign-out (this browser only) should retire its inventory row
      // — otherwise the "This device" row lingers until the JWT's own maxAge.
      const sid = (token as any)?.sid as string | undefined;
      if (!sid) return;
      try {
        await SessionInventory.deleteOne({ jti: sid });
      } catch {
        // Non-fatal; a stale row is harmless — its handle won't be re-used
        // and the periodic revocation gate will treat it as absent on next
        // read.
      }
      forgetJtiCache(sid);
    },
  },
  pages: { signIn: "/login" },
};

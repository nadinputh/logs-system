import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { connectDB } from "./db";
import { User } from "./models/User";
import { PreAuthToken } from "./models/PreAuthToken";
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
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          activeTeamId: user.activeTeamId?.toString() ?? null,
          sessionsVersion: user.sessionsVersion ?? 0,
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
      async authorize(credentials) {
        if (!credentials?.preAuthToken) return null;
        await connectDB();
        const tokenDoc = await PreAuthToken.findOneAndDelete({
          token: credentials.preAuthToken,
          expiresAt: { $gt: new Date() },
        });
        if (!tokenDoc) return null;
        const user = await User.findById(tokenDoc.userId);
        if (!user) return null;
        return {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          activeTeamId: user.activeTeamId?.toString() ?? null,
          sessionsVersion: user.sessionsVersion ?? 0,
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
      }

      if (trigger === "update") {
        token.activeTeamId =
          (session as any)?.activeTeamId ?? token.activeTeamId ?? null;
      }

      /**
       * Revocation check.
       *
       * On every jwt decode after the initial sign-in, compare the token's
       * sessions-version stamp against the current one on the User document.
       * If the DB value is higher, the token is stale (a password was reset,
       * or "sign out other devices" was pressed) and we return an empty token
       * — NextAuth treats that as "no session" and redirects to /login.
       *
       * A DB read per request is too much: cache the fresh value in-process
       * for a short window. That is the same trade-off every JWT-strategy
       * revocation design has to make. 60 seconds is short enough that a lost
       * phone loses access quickly and long enough that a normal browse
       * session is close to free.
       */
      if (!user && token?.id) {
        const cached = readSessionVersionCached(token.id as string);
        if (cached !== null && cached !== (token as any).sv) {
          // Stale — force sign-out on next server touch.
          return {} as any;
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
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
};

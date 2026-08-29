import { cookies } from "next/headers";
import { getServerSession, type Session } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

/**
 * Guards a protected server component. Returns the session, or redirects to
 * `/login` with the right `?reason=` distinction:
 *
 * - Cookie present but session empty → the JWT was invalidated (sessionsVersion
 *   bump, revoked JTI, or the 14-day maxAge). Redirect with
 *   `?reason=session_expired` so the login form shows the "your session ended"
 *   notice.
 * - No cookie → genuine first-visit. Redirect to bare `/login?next=…`.
 *
 * The middleware makes this same distinction, but only sees empty cookies
 * (when the jwt callback ran in a route-handler context and cleared them);
 * Server Components can't set cookies, so their invalidated-in-memory session
 * stays paired with a stale-on-the-wire cookie until the next request. Pages
 * that use `getServerSession` directly and redirect on null land the user on
 * a bare `/login` with no explanation. This wrapper fixes that seam.
 */
export async function requireSession(nextPath: string): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (session?.user) return session;

  const cookieStore = await cookies();
  const hasSessionCookie =
    cookieStore.has("next-auth.session-token") ||
    cookieStore.has("__Secure-next-auth.session-token");

  const url = new URL("/login", "http://placeholder");
  url.searchParams.set("next", nextPath);
  if (hasSessionCookie) url.searchParams.set("reason", "session_expired");
  redirect(url.pathname + url.search);
}

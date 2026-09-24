import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { requireSession } from "@/lib/server/requireSession";

/**
 * Guards every /platform-admin page. Mirrors requireTeamPageAccess's shape,
 * but reads isSuperAdmin fresh from the DB on every call rather than trusting
 * any cached claim — see the comment on requireSuperAdmin() in
 * lib/middleware/auth.ts for why this flag specifically doesn't get the
 * JWT-trust treatment `role` does.
 *
 * A non-superadmin visiting /platform-admin bounces to /dashboard rather than
 * a reason-coded redirect: unlike team access (where a member benefits from
 * knowing *why* — removed vs. no team vs. wrong role), there's nothing
 * informative to tell a non-superadmin here beyond "this isn't for you."
 */
export async function requireSuperAdminPageAccess(nextPath: string) {
  const session = await requireSession(nextPath);

  const userId = (session.user as any).id;
  if (!Types.ObjectId.isValid(userId)) {
    redirect("/login");
  }

  await connectDB();

  const user = await User.findById(userId)
    .select("isSuperAdmin isDisabled name email")
    .lean<{ isSuperAdmin?: boolean; isDisabled?: boolean; name?: string; email?: string } | null>();

  if (!user || user.isDisabled || !user.isSuperAdmin) {
    redirect("/dashboard");
  }

  return { session, user };
}

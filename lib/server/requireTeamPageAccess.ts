import { Types } from "mongoose";
import { redirect } from "next/navigation";
import { connectDB } from "@/lib/db";
import { Team } from "@/lib/models/Team";
import { TeamMember, TeamRole } from "@/lib/models/TeamMember";
import { User } from "@/lib/models/User";
import { requireSession } from "@/lib/server/requireSession";
import { hasMinimumTeamRole } from "@/lib/teamPermissions";

/** Codes the /settings/team page renders as inline explanations. */
export type TeamAccessRedirectReason =
  | "no_active_team"
  | "removed"
  | "suspended"
  | "team_deleted"
  | "insufficient_role";

function buildRedirect(nextPath: string, reason: TeamAccessRedirectReason) {
  const query = new URLSearchParams({ next: nextPath, reason });
  return `/settings/team?${query.toString()}`;
}

/**
 * Guards a team-scoped page. Every redirect encodes *why*, so the settings
 * page can tell a first-timer with no team from a member who was just
 * suspended — the previous behaviour handed both users the same silent bounce.
 *
 * Also reconciles a stale `activeTeamId` pointer at read time: if the pointed
 * team no longer exists, we clear the field on the User so the next request
 * lands on the empty state instead of looping through this redirect.
 */
export async function requireTeamPageAccess(
  minRole: TeamRole,
  nextPath: string,
) {
  // Handles both cases distinctly: no cookie → bare /login; cookie present but
  // session invalidated (sv bump, revoked JTI, expired maxAge) → /login with
  // ?reason=session_expired. Was previously always a bare redirect, so a user
  // whose session got nuked on another device landed on an empty form.
  const session = await requireSession(nextPath);

  const userId = (session.user as any).id;
  if (!Types.ObjectId.isValid(userId)) {
    redirect("/login");
  }

  await connectDB();

  const user = await User.findById(userId).select("activeTeamId").lean<any>();
  const activeTeamId = user?.activeTeamId?.toString?.() ?? null;
  if (!activeTeamId || !Types.ObjectId.isValid(activeTeamId)) {
    redirect(buildRedirect(nextPath, "no_active_team"));
  }

  // The team the pointer names may have been deleted. Distinguish that from
  // "membership removed" so the user hears the truth.
  const team = await Team.findById(activeTeamId).select("_id").lean<any>();
  if (!team) {
    await User.updateOne({ _id: userId }, { $unset: { activeTeamId: 1 } });
    redirect(buildRedirect(nextPath, "team_deleted"));
  }

  const membership = await TeamMember.findOne({
    teamId: activeTeamId,
    userId,
  }).lean<any>();

  if (!membership) {
    redirect(buildRedirect(nextPath, "removed"));
  }

  if (membership.status !== "active") {
    redirect(buildRedirect(nextPath, "suspended"));
  }

  if (!hasMinimumTeamRole(membership.role as TeamRole, minRole)) {
    redirect(buildRedirect(nextPath, "insufficient_role"));
  }

  return {
    teamId: activeTeamId,
    membership,
    session,
  };
}

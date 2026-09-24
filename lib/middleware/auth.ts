import { getServerSession } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "../auth";
import { connectDB } from "../db";
import { TeamMember, TeamRole } from "../models/TeamMember";
import { User } from "../models/User";
import { Team } from "../models/Team";
import { NextResponse } from "next/server";
import {
  TEAM_PERMISSION_MIN_ROLE,
  TEAM_ROLE_WEIGHT,
  TeamPermission,
} from "../teamPermissions";

export type Role = "admin" | "staff";

export async function requireAuth(requiredRole?: Role) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
    };
  }
  const userRole = (session.user as any).role as Role;
  if (requiredRole === "admin" && userRole !== "admin") {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      session: null,
    };
  }
  return { error: null, session };
}

interface TeamAccessOptions {
  teamId?: string;
  minRole?: TeamRole;
}

interface TeamPermissionOptions {
  teamId?: string;
}

export async function requireTeamAccess(options: TeamAccessOptions = {}) {
  const { error, session } = await requireAuth();
  if (error || !session?.user) {
    return {
      error:
        error ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
      teamId: null,
      membership: null,
    };
  }

  const sessionUser = session.user as any;

  await connectDB();

  let resolvedTeamId = options.teamId ?? sessionUser.activeTeamId;
  if (!options.teamId) {
    const dbUser = await User.findById(sessionUser.id)
      .select("activeTeamId")
      .lean<any>();
    if (dbUser?.activeTeamId) {
      resolvedTeamId = dbUser.activeTeamId.toString();
    }
  }

  if (!resolvedTeamId || !Types.ObjectId.isValid(resolvedTeamId)) {
    return {
      error: NextResponse.json(
        { error: "No active team selected" },
        { status: 400 },
      ),
      session,
      teamId: null,
      membership: null,
    };
  }

  const membership = await TeamMember.findOne({
    teamId: resolvedTeamId,
    userId: sessionUser.id,
    status: "active",
  }).lean();

  if (!membership) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      session,
      teamId: null,
      membership: null,
    };
  }

  // Platform-level kill switch, checked here rather than in middleware.ts:
  // middleware runs on the Edge runtime and can't reach Mongoose (the same
  // reason the /terminal role check was moved out of middleware — see that
  // file's comment). requireTeamAccess is the one place every team-scoped API
  // route already passes through, so it's the correct enforcement point.
  const team = await Team.findById(resolvedTeamId).select("platformStatus").lean<{
    platformStatus?: string;
  } | null>();
  if (team?.platformStatus === "suspended") {
    return {
      error: NextResponse.json(
        { error: "This team has been suspended." },
        { status: 403 },
      ),
      session,
      teamId: null,
      membership: null,
    };
  }

  if (
    options.minRole &&
    TEAM_ROLE_WEIGHT[membership.role as TeamRole] <
      TEAM_ROLE_WEIGHT[options.minRole]
  ) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      session,
      teamId: null,
      membership: null,
    };
  }

  return {
    error: null,
    session,
    teamId: resolvedTeamId,
    membership,
  };
}

export async function requireTeamPermission(
  permission: TeamPermission,
  options: TeamPermissionOptions = {},
) {
  return requireTeamAccess({
    teamId: options.teamId,
    minRole: TEAM_PERMISSION_MIN_ROLE[permission],
  });
}

/**
 * Platform superadmin — an orthogonal axis from both `role` (admin|staff,
 * JWT-trusted, see requireAuth above) and team role (always re-read fresh,
 * see requireTeamAccess above). isSuperAdmin deliberately follows the second
 * pattern rather than the first: this flag gates cross-team billing/user data,
 * so revoking it must take effect on the very next request, not at whatever
 * point the JWT happens to refresh or the user next signs in.
 *
 * Never derive this from `role` — that field is a separate, narrowly-scoped
 * constraint used elsewhere (see User.ts), and conflating the two would widen
 * what `role: "admin"` means everywhere it's already checked.
 */
export async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
    };
  }

  await connectDB();
  const dbUser = await User.findById((session.user as any).id)
    .select("isSuperAdmin isDisabled")
    .lean<{ isSuperAdmin?: boolean; isDisabled?: boolean } | null>();

  if (!dbUser || dbUser.isDisabled || !dbUser.isSuperAdmin) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      session: null,
    };
  }

  return { error: null, session };
}

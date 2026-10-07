import { getServerSession, Session } from "next-auth";
import { Types } from "mongoose";
import { authOptions } from "../auth";
import { connectDB } from "../db";
import { TeamMember, TeamRole } from "../models/TeamMember";
import { User } from "../models/User";
import { NextResponse } from "next/server";
import {
  TEAM_PERMISSION_MIN_ROLE,
  TEAM_ROLE_WEIGHT,
  TeamPermission,
} from "../teamPermissions";

type AuthResult =
  | { error: NextResponse; session: null }
  | { error: null; session: AuthedSession };

/**
 * Authentication only. There is deliberately no system-role gate here:
 * `session.user.role` is snapshotted into the JWT at sign-in and can be stale
 * for the token's whole life, so nothing may authorize on it. Authorization is
 * the team role, read from the database per request (requireTeamAccess).
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
    };
  }
  return { error: null, session: session as AuthedSession };
}

interface TeamAccessOptions {
  teamId?: string;
  minRole?: TeamRole;
}

interface TeamPermissionOptions {
  teamId?: string;
}

type AuthedSession = Session & { user: NonNullable<Session["user"]> };

/**
 * Discriminated on `error`: once a caller has returned on `error`, `teamId`,
 * `membership` and `session.user` are all present. Without it the union let
 * `if (auth.error || !auth.teamId) return auth.error` type as `... | null`,
 * which Next's route-handler check rejects at build.
 */
export type TeamAccess =
  | {
      error: NextResponse;
      session: Session | null;
      teamId: null;
      membership: null;
    }
  | {
      error: null;
      session: AuthedSession;
      teamId: string;
      membership: NonNullable<Awaited<ReturnType<typeof findActiveMembership>>>;
    };

function findActiveMembership(teamId: string, userId: string) {
  return TeamMember.findOne({ teamId, userId, status: "active" }).lean();
}

export async function requireTeamAccess(
  options: TeamAccessOptions = {},
): Promise<TeamAccess> {
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

  const membership = await findActiveMembership(resolvedTeamId, sessionUser.id);

  if (!membership) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
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
    session: session as AuthedSession,
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

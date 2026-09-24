import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Team } from "@/lib/models/Team";
import { PlatformAuditLog } from "@/lib/models/PlatformAuditLog";
import { requireSuperAdmin } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

/** Full kill switch — independent of billing status. Enforced in
 *  requireTeamAccess() (lib/middleware/auth.ts), so this takes effect on the
 *  team's very next API request, same as the isSuperAdmin flag itself. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { error, session } = await requireSuperAdmin();
  if (error) return error;

  const { id: teamId } = await params;
  if (!Types.ObjectId.isValid(teamId)) {
    return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const suspend = body?.suspend !== false;

  await connectDB();

  const team = await Team.findById(teamId);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  team.platformStatus = suspend ? "suspended" : "active";
  await team.save();

  await PlatformAuditLog.create({
    actorUserId: (session!.user as any).id,
    action: suspend ? "team_suspended" : "team_reactivated",
    targetType: "team",
    targetId: team._id,
  });

  return NextResponse.json({ ok: true, platformStatus: team.platformStatus });
}

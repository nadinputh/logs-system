import { Types } from "mongoose";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { TeamMember, TeamRole } from "@/lib/models/TeamMember";
import { User } from "@/lib/models/User";
import { hasMinimumTeamRole } from "@/lib/teamPermissions";

function buildSettingsRedirect(nextPath: string) {
  const query = new URLSearchParams({ next: nextPath });
  return `/settings/team?${query.toString()}`;
}

export async function requireTeamPageAccess(
  minRole: TeamRole,
  nextPath: string,
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const userId = (session.user as any).id;
  if (!Types.ObjectId.isValid(userId)) {
    redirect("/login");
  }

  await connectDB();

  const user = await User.findById(userId).select("activeTeamId").lean<any>();
  const activeTeamId = user?.activeTeamId?.toString?.() ?? null;
  if (!activeTeamId || !Types.ObjectId.isValid(activeTeamId)) {
    redirect(buildSettingsRedirect(nextPath));
  }

  const membership = await TeamMember.findOne({
    teamId: activeTeamId,
    userId,
    status: "active",
  }).lean<any>();

  if (!membership) {
    redirect(buildSettingsRedirect(nextPath));
  }

  if (!hasMinimumTeamRole(membership.role as TeamRole, minRole)) {
    redirect("/dashboard");
  }

  return {
    teamId: activeTeamId,
    membership,
    session,
  };
}

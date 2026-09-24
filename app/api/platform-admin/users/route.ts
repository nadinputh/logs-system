import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { TeamMember } from "@/lib/models/TeamMember";
import { Team } from "@/lib/models/Team";
import { requireSuperAdmin } from "@/lib/middleware/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ users: [] });

  await connectDB();

  const users = await User.find({
    $or: [
      { email: { $regex: q, $options: "i" } },
      { name: { $regex: q, $options: "i" } },
    ],
  })
    .select("name email role isSuperAdmin isDisabled emailVerified createdAt")
    .limit(25)
    .lean();

  const userIds = users.map((u) => u._id);
  const memberships = await TeamMember.find({ userId: { $in: userIds }, status: "active" })
    .select("userId teamId role")
    .lean();
  const teamIds = [...new Set(memberships.map((m) => String(m.teamId)))];
  const teams = await Team.find({ _id: { $in: teamIds } }).select("name slug").lean();
  const teamById = new Map(teams.map((t) => [String(t._id), t]));

  const rows = users.map((user) => ({
    ...user,
    _id: String(user._id),
    memberships: memberships
      .filter((m) => String(m.userId) === String(user._id))
      .map((m) => ({
        teamName: teamById.get(String(m.teamId))?.name ?? "Unknown team",
        role: m.role,
      })),
  }));

  return NextResponse.json({ users: rows });
}

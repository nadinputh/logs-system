import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Team } from "@/lib/models/Team";
import { Subscription } from "@/lib/models/Subscription";
import { Plan } from "@/lib/models/Plan";
import { TeamMember } from "@/lib/models/TeamMember";
import { requireSuperAdmin } from "@/lib/middleware/auth";

export const runtime = "nodejs";

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  await connectDB();

  const [teams, subs, plans, memberCounts] = await Promise.all([
    Team.find({}).select("name slug platformStatus createdAt").sort({ createdAt: -1 }).lean(),
    Subscription.find({}).select("teamId planId status").lean(),
    Plan.find({}).select("key name billingCycle").lean(),
    TeamMember.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$teamId", count: { $sum: 1 } } },
    ]),
  ]);

  const subByTeam = new Map(subs.map((s) => [String(s.teamId), s]));
  const planById = new Map(plans.map((p) => [String(p._id), p]));
  const memberCountByTeam = new Map(memberCounts.map((m: any) => [String(m._id), m.count]));

  const rows = teams.map((team) => {
    const sub = subByTeam.get(String(team._id));
    const plan = sub ? planById.get(String(sub.planId)) : null;
    return {
      _id: String(team._id),
      name: team.name,
      slug: team.slug,
      platformStatus: team.platformStatus,
      createdAt: team.createdAt,
      memberCount: memberCountByTeam.get(String(team._id)) ?? 0,
      planName: plan ? `${plan.name} (${plan.billingCycle})` : "No subscription",
      subscriptionStatus: sub?.status ?? null,
    };
  });

  return NextResponse.json({ teams: rows });
}

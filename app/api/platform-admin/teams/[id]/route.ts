import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Team } from "@/lib/models/Team";
import { Subscription } from "@/lib/models/Subscription";
import { Plan } from "@/lib/models/Plan";
import { BillingEvent } from "@/lib/models/BillingEvent";
import { TeamMember } from "@/lib/models/TeamMember";
import { requireSuperAdmin } from "@/lib/middleware/auth";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid team id" }, { status: 400 });
  }

  await connectDB();

  const team = await Team.findById(id).lean();
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const [subscription, memberCount, events, plans] = await Promise.all([
    Subscription.findOne({ teamId: id }).lean(),
    TeamMember.countDocuments({ teamId: id, status: "active" }),
    BillingEvent.find({ teamId: id }).sort({ timestamp: -1 }).limit(50).lean(),
    Plan.find({ isActive: true }).sort({ priceCents: 1 }).lean(),
  ]);

  const planIds = new Set<string>();
  if (subscription?.planId) planIds.add(String(subscription.planId));
  for (const e of events) {
    if (e.fromPlanId) planIds.add(String(e.fromPlanId));
    if (e.toPlanId) planIds.add(String(e.toPlanId));
  }
  const referencedPlans = await Plan.find({ _id: { $in: [...planIds] } })
    .select("name billingCycle")
    .lean();
  const planNameById = new Map(referencedPlans.map((p) => [String(p._id), `${p.name} (${p.billingCycle})`]));

  return NextResponse.json({
    team: { ...team, _id: String(team._id) },
    subscription: subscription ? { ...subscription, _id: String(subscription._id) } : null,
    memberCount,
    events: events.map((e) => ({
      ...e,
      _id: String(e._id),
      fromPlanName: e.fromPlanId ? (planNameById.get(String(e.fromPlanId)) ?? null) : null,
      toPlanName: e.toPlanId ? (planNameById.get(String(e.toPlanId)) ?? null) : null,
    })),
    availablePlans: plans.map((p) => ({ _id: String(p._id), name: p.name, billingCycle: p.billingCycle })),
    currentPlanName: subscription?.planId ? (planNameById.get(String(subscription.planId)) ?? null) : null,
  });
}

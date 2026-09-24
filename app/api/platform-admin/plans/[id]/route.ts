import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Plan } from "@/lib/models/Plan";
import { PlatformAuditLog } from "@/lib/models/PlatformAuditLog";
import { requireSuperAdmin } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

/**
 * Deliberately does NOT accept priceCents or stripePriceId here — Stripe
 * Prices are immutable, and changing a plan's price in place would silently
 * reprice every existing subscriber. Repricing a tier means creating a new
 * Plan row (a new key+billingCycle pair or a new Stripe Price synced onto
 * this one) so existing subscribers keep what they signed up for.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { error, session } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  await connectDB();

  const plan = await Plan.findById(id);
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const before = plan.toObject();

  if (typeof body.name === "string") plan.name = body.name;
  if (typeof body.trialDays === "number") plan.trialDays = body.trialDays;
  if (typeof body.isActive === "boolean") plan.isActive = body.isActive;
  if (body.limits && typeof body.limits === "object") {
    const l = body.limits;
    if ("maxBuildings" in l) plan.limits.maxBuildings = l.maxBuildings;
    if ("maxTeamMembers" in l) plan.limits.maxTeamMembers = l.maxTeamMembers;
    if ("maxQuestCards" in l) plan.limits.maxQuestCards = l.maxQuestCards;
    if ("logRetentionDays" in l) plan.limits.logRetentionDays = l.logRetentionDays;
    if ("blePush" in l) plan.limits.blePush = Boolean(l.blePush);
  }

  await plan.save();

  await PlatformAuditLog.create({
    actorUserId: (session!.user as any).id,
    action: "plan_updated",
    targetType: "plan",
    targetId: plan._id,
    detail: { before, after: plan.toObject() },
  });

  return NextResponse.json({ plan });
}

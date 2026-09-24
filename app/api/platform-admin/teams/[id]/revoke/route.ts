import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Plan } from "@/lib/models/Plan";
import { Subscription } from "@/lib/models/Subscription";
import { BillingEvent } from "@/lib/models/BillingEvent";
import { requireSuperAdmin } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { getBillingProvider } from "@/lib/billing/provider";
import { enforcePlanLimitsAfterDowngrade } from "@/lib/entitlements";

export const runtime = "nodejs";

/** Mirror of grant: resets a team to the Free plan, canceling any live
 *  Stripe subscription in the same way a manual grant would supersede it. */
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

  await connectDB();

  const [freePlan, existing] = await Promise.all([
    Plan.findOne({ key: "free", billingCycle: "monthly" }).lean(),
    Subscription.findOne({ teamId }),
  ]);
  if (!freePlan) {
    return NextResponse.json({ error: "Free plan is not seeded — run npm run seed:plans" }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "This team has no subscription to revoke" }, { status: 404 });
  }

  const fromPlanId = existing.planId;

  if (existing.provider && existing.provider !== "manual" && existing.providerSubscriptionId) {
    const provider = await getBillingProvider();
    try {
      await provider.cancelSubscriptionNow(existing.providerSubscriptionId);
    } catch {
      // Same rationale as the grant route: don't block the superadmin action
      // on the payment processor being unreachable.
    }
  }

  existing.planId = freePlan._id;
  existing.status = "active";
  existing.provider = "manual";
  existing.providerSubscriptionId = undefined;
  existing.cancelAtPeriodEnd = false;
  existing.trialEndsAt = null;
  existing.pastDueSince = null;
  existing.grantType = "manual_comp";
  existing.grantedByUserId = (session!.user as any).id;
  existing.grantReason = "Reset to Free by platform admin";
  existing.grantExpiresAt = null;
  await existing.save();

  await BillingEvent.create({
    teamId,
    type: "comp_revoked",
    fromPlanId,
    toPlanId: freePlan._id,
    actorUserId: (session!.user as any).id,
  });

  await enforcePlanLimitsAfterDowngrade(teamId);

  return NextResponse.json({ ok: true });
}

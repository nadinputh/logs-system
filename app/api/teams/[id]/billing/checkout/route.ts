import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { Team } from "@/lib/models/Team";
import { Plan } from "@/lib/models/Plan";
import { Subscription } from "@/lib/models/Subscription";
import { User } from "@/lib/models/User";
import { BillingEvent } from "@/lib/models/BillingEvent";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { getBillingProvider, isBillingConfigured, mockBillingEnabled } from "@/lib/billing/provider";
import { enforcePlanLimitsAfterDowngrade } from "@/lib/entitlements";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const CheckoutSchema = z.object({ planId: z.string().min(1) });

const APP_ORIGIN = process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { id } = await params;
  const auth = await requireTeamPermission("team.billing.manage", { teamId: id });
  if (auth.error || !auth.teamId || !auth.session?.user) return auth.error;

  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A plan is required" }, { status: 400 });
  }
  if (!Types.ObjectId.isValid(parsed.data.planId)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  await connectDB();

  const plan = await Plan.findOne({ _id: parsed.data.planId, isActive: true }).lean();
  // Plans are never synced to Stripe in dev — see scripts/seed-plans.ts — so
  // the mock bypass uses the Plan's own _id as its "price ref" instead of a
  // real Stripe Price id; the mock provider knows how to resolve either.
  const priceRef = plan?.stripePriceId ?? (mockBillingEnabled() ? String(plan?._id ?? "") : undefined);
  if (!plan || !priceRef) {
    return NextResponse.json({ error: "This plan is not available for self-serve checkout" }, { status: 404 });
  }

  const [team, actor, existing] = await Promise.all([
    Team.findById(auth.teamId).select("name").lean(),
    User.findById((auth.session.user as any).id).select("email").lean(),
    Subscription.findOne({ teamId: auth.teamId }),
  ]);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  const provider = await getBillingProvider();

  // A team already on a LIVE subscription (real Stripe, or a mock one from
  // BILLING_MOCK_MODE) switching tiers must go through changeSubscriptionPlan
  // (proration on the existing subscription), never a new Checkout Session —
  // that would mint a second subscription against the same customer and
  // double-bill them. Checkout Sessions are only for a team with no live
  // subscription: first-ever purchase, converting a manual comp (no
  // providerSubscriptionId) into a real one, or — critically — resubscribing
  // after a cancellation. `status: "canceled"` is deliberately excluded from
  // "live" here: cancelSubscriptionNow/handleSubscriptionDeleted flip status
  // but never clear providerSubscriptionId (the dead provider subscription id
  // stays on the record as history), so without this check every checkout
  // after a team's first cancellation silently fell into
  // changeSubscriptionPlan — which only rewrites planId/currentPeriodEnd, never
  // status — permanently stranding the team on "canceled" no matter which
  // plan they picked, with no new Checkout Session and no new invoice ever
  // issued again.
  if (
    existing?.provider &&
    existing.provider !== "manual" &&
    existing.providerSubscriptionId &&
    existing.status !== "canceled"
  ) {
    if (String(existing.planId) === String(plan._id)) {
      return NextResponse.json({ error: "This team is already on that plan" }, { status: 400 });
    }

    const fromPlanId = existing.planId;
    const { currentPeriodEnd } = await provider.changeSubscriptionPlan(
      existing.providerSubscriptionId,
      priceRef,
    );

    existing.planId = plan._id;
    existing.currentPeriodEnd = currentPeriodEnd;
    existing.cancelAtPeriodEnd = false;
    await existing.save();

    await BillingEvent.create({
      teamId: auth.teamId,
      type: "plan_changed",
      fromPlanId,
      toPlanId: plan._id,
      actorUserId: (auth.session.user as any).id,
    });

    // Covers both directions — downgrade needs pruning, upgrade is a no-op
    // inside enforcePlanLimitsAfterDowngrade since nothing is over its (now
    // larger or equal) limits.
    await enforcePlanLimitsAfterDowngrade(auth.teamId);

    return NextResponse.json({ changed: true });
  }

  const { url } = await provider.createCheckoutSession({
    teamId: String(auth.teamId),
    teamName: team.name,
    planStripePriceId: priceRef,
    customerId: existing?.providerCustomerId,
    customerEmail: existing?.providerCustomerId ? undefined : actor?.email,
    successUrl: `${APP_ORIGIN}/settings/team?billing=success`,
    cancelUrl: `${APP_ORIGIN}/settings/team?billing=canceled`,
    trialDays: plan.trialDays || undefined,
    allowPromotionCodes: true,
  });

  return NextResponse.json({ url });
}

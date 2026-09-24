import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Subscription } from "@/lib/models/Subscription";
import { Plan } from "@/lib/models/Plan";
import { Invoice } from "@/lib/models/Invoice";
import { TeamMember } from "@/lib/models/TeamMember";
import { Building } from "@/lib/models/Building";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { isBillingConfigured, mockBillingEnabled } from "@/lib/billing/provider";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireTeamPermission("team.billing.manage", { teamId: id });
  if (auth.error || !auth.teamId) return auth.error;

  await connectDB();

  // Legacy-unlimited is excluded by `isActive: true` alone (see seed-plans.ts)
  // — it's grandfathered-in only, never a self-serve purchase target. Every
  // other plan additionally requires a synced stripePriceId for real Stripe,
  // since Checkout can't sell a price that doesn't exist on Stripe's side;
  // the dev-mode bypass skips that requirement because it never syncs plans
  // to Stripe in the first place (see scripts/seed-plans.ts) — the checkout
  // route's own priceRef fallback is what lets an unsynced plan actually
  // complete a mock checkout.
  const planFilter: Record<string, unknown> = { isActive: true };
  if (!mockBillingEnabled()) {
    planFilter.stripePriceId = { $exists: true, $ne: null };
  }

  const [subscription, plans] = await Promise.all([
    Subscription.findOne({ teamId: auth.teamId }).lean(),
    Plan.find(planFilter)
      .select("key name billingCycle priceCents currency trialDays limits")
      .sort({ priceCents: 1 })
      .lean(),
  ]);

  const currentPlan = subscription
    ? await Plan.findById(subscription.planId).select("key name billingCycle priceCents currency limits").lean()
    : null;

  const invoices = subscription
    ? await Invoice.find({ subscriptionId: subscription._id })
        .sort({ issuedAt: -1 })
        .limit(12)
        .select("number status amountCents currency issuedAt pdfUrl")
        .lean()
    : [];

  // Raw counts the client uses to preview a downgrade's fallout (see
  // enforcePlanLimitsAfterDowngrade, whose math this mirrors) before the
  // owner commits to a plan switch, rather than after.
  const [activeMembers, activeBuildings] = await Promise.all([
    TeamMember.countDocuments({ teamId: auth.teamId, status: "active", role: { $ne: "owner" } }),
    Building.countDocuments({ teamId: auth.teamId, isArchived: { $ne: true } }),
  ]);

  return NextResponse.json({
    // Kept as `stripeConfigured` for the existing UI gate — true whenever
    // *some* provider (real Stripe, or the BILLING_MOCK_MODE dev bypass) is
    // ready to take a checkout, not necessarily Stripe specifically.
    stripeConfigured: isBillingConfigured(),
    billingMode: mockBillingEnabled() ? "mock" : "stripe",
    subscription: subscription
      ? {
          status: subscription.status,
          provider: subscription.provider,
          currentPeriodEnd: subscription.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          trialEndsAt: subscription.trialEndsAt ?? null,
          hasStripeCustomer: Boolean(subscription.providerCustomerId),
          grantReason: subscription.grantReason ?? null,
        }
      : null,
    currentPlan,
    plans,
    invoices,
    teamUsage: { activeMembers, activeBuildings },
  });
}

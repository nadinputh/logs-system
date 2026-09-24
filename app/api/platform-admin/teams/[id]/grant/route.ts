import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Team } from "@/lib/models/Team";
import { Plan } from "@/lib/models/Plan";
import { Subscription } from "@/lib/models/Subscription";
import { BillingEvent } from "@/lib/models/BillingEvent";
import { requireSuperAdmin } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { getBillingProvider } from "@/lib/billing/provider";
import { enforcePlanLimitsAfterDowngrade } from "@/lib/entitlements";

export const runtime = "nodejs";

/**
 * Manual grant always wins over an existing paid subscription (per the
 * decisions log): if the team is currently paying Stripe, that subscription
 * is canceled immediately — not at period end — so the customer isn't
 * double-charged while comped. Their Stripe Customer object (payment methods,
 * invoice history) is untouched; only the Subscription is superseded, so a
 * later real checkout just creates a new Stripe subscription against the
 * same customer.
 */
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

  const body = await req.json().catch(() => null);
  const planId = body?.planId as string | undefined;
  const reason = (body?.reason as string | undefined)?.trim();
  const grantExpiresAt = body?.grantExpiresAt ? new Date(body.grantExpiresAt) : null;

  if (!planId || !Types.ObjectId.isValid(planId)) {
    return NextResponse.json({ error: "A plan is required" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "A reason is required for a manual grant" }, { status: 400 });
  }

  await connectDB();

  const [team, plan, existing] = await Promise.all([
    Team.findById(teamId).select("_id name").lean(),
    Plan.findById(planId).lean(),
    Subscription.findOne({ teamId }),
  ]);
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
  if (!plan) return NextResponse.json({ error: "Plan not found" }, { status: 404 });

  const fromPlanId = existing?.planId ?? undefined;
  let supersededNote: string | undefined;

  if (existing?.provider && existing.provider !== "manual" && existing.providerSubscriptionId) {
    const provider = await getBillingProvider();
    try {
      await provider.cancelSubscriptionNow(existing.providerSubscriptionId);
      supersededNote =
        existing.provider === "mock"
          ? "Existing mock subscription canceled immediately to avoid double-billing."
          : "Existing Stripe subscription canceled immediately to avoid double-billing.";
    } catch (err) {
      // Billing may be unconfigured (no STRIPE_SECRET_KEY) or the subscription
      // may already be gone on Stripe's side. Either way, the grant should
      // still proceed — a superadmin's explicit override must not be blocked
      // by the payment processor being unreachable — but the ambiguity goes
      // into the audit trail rather than being silently swallowed.
      supersededNote = `Could not cancel the existing Stripe subscription automatically (${(err as Error).message}). Verify manually in the Stripe dashboard.`;
    }
  }

  await Subscription.findOneAndUpdate(
    { teamId },
    {
      teamId,
      planId: plan._id,
      status: "active",
      provider: "manual",
      providerCustomerId: existing?.providerCustomerId, // preserved for a future real checkout
      providerSubscriptionId: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: grantExpiresAt,
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      pastDueSince: null,
      grantType: "manual_comp",
      grantedByUserId: (session!.user as any).id,
      grantReason: reason,
      grantExpiresAt,
    },
    { upsert: true, setDefaultsOnInsert: true },
  );

  await BillingEvent.create({
    teamId,
    type: "comped",
    fromPlanId,
    toPlanId: plan._id,
    actorUserId: (session!.user as any).id,
    note: [reason, supersededNote].filter(Boolean).join(" — "),
  });

  // A grant can move a team to a smaller plan than it currently has (e.g. a
  // support downgrade), not just a bigger one — this is a no-op when the new
  // plan's limits comfortably cover the team's existing usage.
  await enforcePlanLimitsAfterDowngrade(teamId);

  return NextResponse.json({ ok: true, note: supersededNote ?? null });
}

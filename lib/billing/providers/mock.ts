import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Plan } from "@/lib/models/Plan";
import { Subscription } from "@/lib/models/Subscription";
import { MockCheckoutSession } from "@/lib/models/MockCheckoutSession";
import type {
  BillingProvider,
  CheckoutSessionParams,
  PortalSessionParams,
  CreateCouponParams,
} from "../provider";
import { mockBillingEnabled } from "../provider";
import { handleSubscriptionUpdated, handleSubscriptionDeleted } from "../webhookHandlers";

/**
 * Dev-mode-bypass billing provider — never reachable unless BILLING_MOCK_MODE
 * is set AND NODE_ENV isn't "production" (see mockBillingEnabled() in
 * ../provider.ts, which every function below trusts its caller already
 * checked via getBillingProvider()). Stands in for Stripe end to end:
 * "redirect" is a real page in this app (app/dev/billing/checkout/[token]),
 * "pay" is picking an outcome button there, and "callback" is that page's
 * server action calling the exact same lib/billing/webhookHandlers functions
 * the real Stripe webhook route calls — so a scenario that passes here
 * exercises the real write path, not a parallel fake of it.
 *
 * No Stripe SDK import anywhere in this file, on purpose — a dev running
 * BILLING_MOCK_MODE without `stripe` installed, or without network access,
 * must still be able to exercise the full checkout → payment → callback →
 * invoice lifecycle.
 */

const APP_ORIGIN = process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`;

async function resolvePlanByPriceRef(priceRef: string) {
  await connectDB();
  const byStripeId = await Plan.findOne({ stripePriceId: priceRef }).lean();
  if (byStripeId) return byStripeId;
  if (Types.ObjectId.isValid(priceRef)) {
    return Plan.findById(priceRef).lean();
  }
  return null;
}

/**
 * Real Checkout Sessions require a Stripe Price id (see the checkout route's
 * `plan.stripePriceId` guard). In mock mode plans are never synced to Stripe
 * — see scripts/seed-plans.ts — so the checkout route falls back to passing
 * the Plan's own _id as the "price ref" instead. This resolves either shape.
 */
async function createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }> {
  const plan = await resolvePlanByPriceRef(params.planStripePriceId);
  if (!plan) {
    throw new Error(`[billing mock] No plan matches priceRef "${params.planStripePriceId}"`);
  }

  const token = randomUUID();
  await MockCheckoutSession.create({
    token,
    teamId: params.teamId,
    teamName: params.teamName,
    planId: String(plan._id),
    customerId: params.customerId,
    customerEmail: params.customerEmail,
    successUrl: params.successUrl,
    cancelUrl: params.cancelUrl,
    trialDays: params.trialDays ?? 0,
  });

  return { url: `${APP_ORIGIN}/dev/billing/checkout/${token}` };
}

async function createPortalSession(params: PortalSessionParams): Promise<{ url: string }> {
  const query = new URLSearchParams({ return: params.returnUrl });
  return {
    url: `${APP_ORIGIN}/dev/billing/portal/${encodeURIComponent(params.customerId)}?${query.toString()}`,
  };
}

async function cancelSubscriptionNow(providerSubscriptionId: string): Promise<void> {
  await connectDB();
  const result = await handleSubscriptionDeleted({
    providerEventId: `evt_mock_${randomUUID()}`,
    providerSubscriptionId,
  });
  if (!result.handled && !result.deduped) {
    throw new Error(`[billing mock] Unknown mock subscription "${providerSubscriptionId}"`);
  }
}

/**
 * No app route calls this today (see the comment on the interface method in
 * ../provider.ts) — real self-serve cancellation happens inside Stripe's
 * hosted Billing Portal, which this app never routes through in code. The
 * dev-mode mock portal (app/dev/billing/portal/[customerId]) is standing in
 * for that hosted UI, so unlike Stripe's real portal → webhook round trip,
 * this writes the Subscription flip synchronously — there's no second
 * "Stripe confirms async" hop to simulate when this *is* the confirmation.
 */
async function cancelAtPeriodEnd(providerSubscriptionId: string, cancel: boolean): Promise<void> {
  await connectDB();
  const record = await Subscription.findOne({ providerSubscriptionId })
    .select("status currentPeriodStart currentPeriodEnd")
    .lean();
  if (!record) {
    throw new Error(`[billing mock] Unknown mock subscription "${providerSubscriptionId}"`);
  }

  await handleSubscriptionUpdated({
    providerEventId: `evt_mock_${randomUUID()}`,
    providerSubscriptionId,
    planId: null,
    status: record.status === "trialing" ? "trialing" : "active",
    currentPeriodStart: record.currentPeriodStart ?? new Date(),
    currentPeriodEnd: record.currentPeriodEnd ?? new Date(),
    cancelAtPeriodEnd: cancel,
  });
}

/**
 * Deliberately does NOT write to Mongo — mirrors providers/stripe.ts's
 * changeSubscriptionPlan exactly, which only calls the Stripe API and
 * returns the new period end. The actual Subscription/BillingEvent writes
 * for a tier switch come from the checkout route's own synchronous update
 * plus (for real Stripe) an async customer.subscription.updated webhook
 * confirming it — duplicating that here would double-write a
 * "plan_changed" BillingEvent that the checkout route already creates.
 * There's no real proration clock in mock mode, so the period boundary
 * just carries forward unchanged.
 */
async function changeSubscriptionPlan(
  providerSubscriptionId: string,
  newPriceId: string,
): Promise<{ currentPeriodEnd: Date }> {
  await connectDB();
  const plan = await resolvePlanByPriceRef(newPriceId);
  if (!plan) {
    throw new Error(`[billing mock] No plan matches priceRef "${newPriceId}"`);
  }
  const record = await Subscription.findOne({ providerSubscriptionId })
    .select("currentPeriodEnd")
    .lean();
  if (!record) {
    throw new Error(`[billing mock] Unknown mock subscription "${providerSubscriptionId}"`);
  }
  return { currentPeriodEnd: record.currentPeriodEnd ?? new Date() };
}

async function createCoupon(_params: CreateCouponParams): Promise<{ providerCouponId: string }> {
  // Coupon redemption at checkout isn't part of the mock checkout page — this
  // exists so platform-admin's coupon CRUD (app/api/platform-admin/promotions)
  // doesn't error out in dev mode, not to simulate promo-code math.
  return { providerCouponId: `mock_coupon_${randomUUID()}` };
}

async function deactivateCoupon(_providerCouponId: string): Promise<void> {
  // No external state to tear down — the Coupon document's own isActive flag
  // (set by the caller) is the only state a mock coupon has.
}

async function parseWebhookEvent(): Promise<unknown> {
  throw new Error(
    "[billing mock] The mock provider never receives a real webhook request — " +
      "dev-mode callbacks call lib/billing/webhookHandlers directly instead " +
      "(see app/api/dev/billing/*). This should be unreachable.",
  );
}

export const mockProvider: BillingProvider = {
  name: "mock",
  isConfigured: mockBillingEnabled,
  createCheckoutSession,
  createPortalSession,
  cancelSubscriptionNow,
  cancelAtPeriodEnd,
  changeSubscriptionPlan,
  createCoupon,
  deactivateCoupon,
  parseWebhookEvent,
};

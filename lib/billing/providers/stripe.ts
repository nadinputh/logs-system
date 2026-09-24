import type Stripe from "stripe";
import type {
  BillingProvider,
  CheckoutSessionParams,
  PortalSessionParams,
  CreateCouponParams,
} from "../provider";

/**
 * Deliberately no static `import Stripe from "stripe"` value-import (the
 * type-only import above is erased at compile time and never reaches the
 * bundle). Mirrors lib/email/send.ts's loadNodemailer: an optional external
 * capability should degrade the routes that use it, not the whole build, and
 * the client can't be constructed at module-load time anyway since it needs
 * STRIPE_SECRET_KEY, which may not exist yet in a fresh checkout of this repo.
 */
declare global {
  // eslint-disable-next-line no-var
  var _stripeClient: Stripe | undefined;
}

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

if (process.env.NODE_ENV === "production" && !stripeConfigured()) {
  console.error(
    "[billing] STARTUP: Stripe is not configured — checkout, the billing " +
      "portal, and webhook processing are all unavailable. Set " +
      "STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
  );
}

async function loadStripeSdk(): Promise<typeof Stripe> {
  const load = new Function("m", "return import(m)") as (
    m: string,
  ) => Promise<{ default: typeof Stripe }>;
  try {
    const mod = await load("stripe");
    return mod.default;
  } catch (err) {
    throw new Error(
      "Stripe SDK unavailable — the 'stripe' package is not installed. " +
        `Run your package manager's install. Original error: ${(err as Error)?.message}`,
    );
  }
}

/**
 * Exported for the Stripe webhook route (app/api/webhooks/stripe/route.ts),
 * which needs a live client for reads (subscriptions.retrieve) that the
 * provider-agnostic BillingProvider interface deliberately doesn't expose —
 * webhook event shapes are inherently Stripe-specific already, so that route
 * is allowed to know it's talking to Stripe. Nothing else in the app should
 * import this.
 */
export async function getStripeClient(): Promise<Stripe> {
  if (global._stripeClient) return global._stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Stripe is not configured — set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET",
    );
  }

  const StripeSdk = await loadStripeSdk();
  global._stripeClient = new StripeSdk(secretKey, {
    apiVersion: "2026-08-26.dahlia",
    typescript: true,
  });
  return global._stripeClient;
}

/** Mirrors resetTransport() in lib/email/send.ts — a corrected key should not
 *  require a full process restart to take effect. */
export function resetStripeClient() {
  global._stripeClient = undefined;
}

async function createCheckoutSession(
  params: CheckoutSessionParams,
): Promise<{ url: string }> {
  const stripe = await getStripeClient();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: params.planStripePriceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    client_reference_id: params.teamId,
    ...(params.customerId
      ? { customer: params.customerId }
      : { customer_email: params.customerEmail }),
    ...(params.trialDays
      ? { subscription_data: { trial_period_days: params.trialDays } }
      : {}),
    allow_promotion_codes: Boolean(params.allowPromotionCodes),
    metadata: { teamId: params.teamId, teamName: params.teamName },
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return { url: session.url };
}

async function createPortalSession(
  params: PortalSessionParams,
): Promise<{ url: string }> {
  const stripe = await getStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  return { url: session.url };
}

async function cancelSubscriptionNow(providerSubscriptionId: string): Promise<void> {
  const stripe = await getStripeClient();
  await stripe.subscriptions.cancel(providerSubscriptionId);
}

async function cancelAtPeriodEnd(
  providerSubscriptionId: string,
  cancel: boolean,
): Promise<void> {
  const stripe = await getStripeClient();
  await stripe.subscriptions.update(providerSubscriptionId, {
    cancel_at_period_end: cancel,
  });
}

async function changeSubscriptionPlan(
  providerSubscriptionId: string,
  newPriceId: string,
): Promise<{ currentPeriodEnd: Date }> {
  const stripe = await getStripeClient();
  const current = await stripe.subscriptions.retrieve(providerSubscriptionId);
  const itemId = current.items.data[0]?.id;
  if (!itemId) throw new Error("Subscription has no line item to update");

  const updated = await stripe.subscriptions.update(providerSubscriptionId, {
    items: [{ id: itemId, price: newPriceId }],
    proration_behavior: "create_prorations",
    cancel_at_period_end: false,
  });
  return { currentPeriodEnd: new Date(updated.items.data[0].current_period_end * 1000) };
}

async function createCoupon(
  params: CreateCouponParams,
): Promise<{ providerCouponId: string }> {
  const stripe = await getStripeClient();
  const coupon = await stripe.coupons.create({
    name: params.code,
    ...(params.type === "percent"
      ? { percent_off: params.value }
      : { amount_off: params.value, currency: params.currency ?? "usd" }),
    duration: "once",
  });
  // A Promotion Code is the customer-facing string ("LAUNCH20"); the Coupon
  // above is the underlying discount definition. Checkout needs the former.
  await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: coupon.id },
    code: params.code,
  });
  return { providerCouponId: coupon.id };
}

async function deactivateCoupon(providerCouponId: string): Promise<void> {
  const stripe = await getStripeClient();
  await stripe.coupons.del(providerCouponId);
}

async function parseWebhookEvent(
  rawBody: string,
  signatureHeader: string,
): Promise<Stripe.Event> {
  // constructEvent is synchronous crypto verification (no network call), but
  // loading the SDK itself still goes through the same lazy indirection as
  // every other call here. Callers only reach this after a request already
  // arrived with a signature header, so a throw surfaces as a 400 to Stripe's
  // retry logic — never a silently-accepted forged event.
  const StripeSdk = await loadStripeSdk();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return StripeSdk.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
}

export const stripeProvider: BillingProvider = {
  name: "stripe",
  isConfigured: stripeConfigured,
  createCheckoutSession,
  createPortalSession,
  cancelSubscriptionNow,
  cancelAtPeriodEnd,
  changeSubscriptionPlan,
  createCoupon,
  deactivateCoupon,
  parseWebhookEvent,
};

/**
 * Payment-provider abstraction. Stripe is the only implementation today
 * (lib/billing/providers/stripe.ts), but nothing outside lib/billing/ should
 * import the `stripe` package directly — a second processor is a new file
 * implementing this interface, not a rewrite of checkout/webhook/UI call sites.
 */

export interface CheckoutSessionParams {
  teamId: string;
  teamName: string;
  planStripePriceId: string;
  /** Existing Stripe Customer id, if this team has one already. */
  customerId?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
  /** Only public coupons ever reach here — see Coupon.isPublic. */
  allowPromotionCodes?: boolean;
}

export interface PortalSessionParams {
  customerId: string;
  returnUrl: string;
}

export interface CreateCouponParams {
  code: string;
  type: "percent" | "fixed";
  value: number;
  currency?: string; // required for "fixed"
}

export interface WebhookResult {
  type: string;
  teamId?: string;
  handled: boolean;
}

export interface BillingProvider {
  readonly name: "stripe" | "manual" | "mock";
  isConfigured(): boolean;
  createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }>;
  createPortalSession(params: PortalSessionParams): Promise<{ url: string }>;
  /** Cancels immediately — used when a manual grant supersedes a paid plan.
   *  Self-serve cancellation (cancel-at-period-end) is a separate, softer call. */
  cancelSubscriptionNow(providerSubscriptionId: string): Promise<void>;
  cancelAtPeriodEnd(providerSubscriptionId: string, cancel: boolean): Promise<void>;
  /** Changes the price on an EXISTING live subscription (upgrade or
   *  downgrade between paid tiers), with proration — never a new Checkout
   *  Session. A team with a live Stripe subscription must never be routed
   *  through createCheckoutSession to switch tiers: that mints a second,
   *  independent subscription against the same customer and double-bills
   *  them. Also un-cancels: picking a new plan is an implicit "keep going,"
   *  so any pending cancel_at_period_end from a prior portal visit is cleared. */
  changeSubscriptionPlan(
    providerSubscriptionId: string,
    newPriceId: string,
  ): Promise<{ currentPeriodEnd: Date }>;
  createCoupon(params: CreateCouponParams): Promise<{ providerCouponId: string }>;
  deactivateCoupon(providerCouponId: string): Promise<void>;
  /** Verifies the signature and parses the raw request body/headers into a
   *  typed event. Throws on an invalid signature — callers must 400, not 200,
   *  so Stripe retries rather than assuming a forged event was handled. */
  parseWebhookEvent(rawBody: string, signatureHeader: string): Promise<unknown>;
}

let cached: BillingProvider | null = null;

/**
 * True dev-mode-bypass gate: BILLING_MOCK_MODE must be explicitly set AND
 * NODE_ENV must not be "production". The env check alone isn't trusted —
 * a stray BILLING_MOCK_MODE=true in a prod-like env var file must never
 * silently switch a real deployment onto the fake provider.
 */
export function mockBillingEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.BILLING_MOCK_MODE === "true";
}

/**
 * Whichever provider is active (Stripe or the dev-mode mock) is "configured"
 * for the purposes of every route that gates on `stripeConfigured()` today —
 * this is the one to use for that gate going forward so a route doesn't have
 * to special-case dev mode itself. Both providers expose isConfigured(), but
 * checking mockBillingEnabled() directly here avoids importing the Stripe
 * provider module (and its "Stripe is not configured" startup warning) on a
 * request path that's about to use the mock instead.
 */
export function isBillingConfigured(): boolean {
  if (mockBillingEnabled()) return true;
  // Deferred import mirrors getBillingProvider() below — avoid pulling the
  // stripe package in on a request that's just checking configuration.
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * Stripe is the only real processor, but in development BILLING_MOCK_MODE
 * swaps in a local stand-in that never talks to Stripe — see
 * lib/billing/providers/mock.ts and the CLAUDE.md billing section for what
 * it simulates. Every call site goes through here rather than importing
 * either implementation directly, so this branch is the only place that
 * needs to know dev mode exists.
 */
export async function getBillingProvider(): Promise<BillingProvider> {
  if (cached) return cached;
  if (mockBillingEnabled()) {
    const { mockProvider } = await import("./providers/mock");
    cached = mockProvider;
    return cached;
  }
  const { stripeProvider } = await import("./providers/stripe");
  cached = stripeProvider;
  return cached;
}

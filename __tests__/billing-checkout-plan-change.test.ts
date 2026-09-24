import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEAM_ID = "507f1f77bcf86cd799439011";
const ACTOR_USER_ID = "507f1f77bcf86cd799439012";
const PLAN_ID = "507f1f77bcf86cd799439013";
const OLD_PLAN_ID = "507f1f77bcf86cd799439014";
const STRIPE_SUB_ID = "sub_live123";

function makeReq(body: unknown = { planId: PLAN_ID }) {
  return new NextRequest(`http://localhost/api/teams/${TEAM_ID}/billing/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/teams/[id]/billing/checkout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupMocks(options?: {
    existingSubscription?: any;
    stripeConfigured?: boolean;
  }) {
    const requireTeamPermission = vi.fn().mockResolvedValue({
      error: null,
      teamId: TEAM_ID,
      session: { user: { id: ACTOR_USER_ID } },
    });
    const connectDB = vi.fn().mockResolvedValue(undefined);
    const assertSameOrigin = vi.fn().mockReturnValue(null);

    const plan = {
      _id: PLAN_ID,
      key: "pro",
      stripePriceId: "price_pro_monthly",
      trialDays: 7,
    };
    const planFindOne = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(plan),
    });

    const team = { _id: TEAM_ID, name: "Acme" };
    const teamFindById = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(team) }),
    });

    const actor = { email: "owner@example.com" };
    const userFindById = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(actor) }),
    });

    const existingDoc = options?.existingSubscription
      ? { ...options.existingSubscription, save: vi.fn().mockResolvedValue(undefined) }
      : null;
    const subscriptionFindOne = vi.fn().mockResolvedValue(existingDoc);

    const billingEventCreate = vi.fn().mockResolvedValue({ _id: "event1" });
    const enforcePlanLimitsAfterDowngrade = vi.fn().mockResolvedValue(undefined);

    const createCheckoutSession = vi.fn().mockResolvedValue({ url: "https://stripe.test/checkout" });
    const changeSubscriptionPlan = vi.fn().mockResolvedValue({ currentPeriodEnd: new Date("2027-01-01") });
    const getBillingProvider = vi.fn().mockResolvedValue({
      createCheckoutSession,
      changeSubscriptionPlan,
    });
    const isBillingConfigured = vi.fn().mockReturnValue(options?.stripeConfigured ?? true);
    const mockBillingEnabled = vi.fn().mockReturnValue(false);

    vi.doMock("@/lib/middleware/auth", () => ({ requireTeamPermission }));
    vi.doMock("@/lib/db", () => ({ connectDB }));
    vi.doMock("@/lib/csrf", () => ({ assertSameOrigin }));
    vi.doMock("@/lib/models/Plan", () => ({ Plan: { findOne: planFindOne } }));
    vi.doMock("@/lib/models/Team", () => ({ Team: { findById: teamFindById } }));
    vi.doMock("@/lib/models/User", () => ({ User: { findById: userFindById } }));
    vi.doMock("@/lib/models/Subscription", () => ({ Subscription: { findOne: subscriptionFindOne } }));
    vi.doMock("@/lib/models/BillingEvent", () => ({ BillingEvent: { create: billingEventCreate } }));
    vi.doMock("@/lib/entitlements", () => ({ enforcePlanLimitsAfterDowngrade }));
    vi.doMock("@/lib/billing/provider", () => ({ getBillingProvider, isBillingConfigured, mockBillingEnabled }));

    const { POST } = await import("@/app/api/teams/[id]/billing/checkout/route");

    return {
      POST,
      createCheckoutSession,
      changeSubscriptionPlan,
      billingEventCreate,
      enforcePlanLimitsAfterDowngrade,
      existingDoc,
    };
  }

  it("uses a new Checkout Session when the team has no live Stripe subscription", async () => {
    const { POST, createCheckoutSession, changeSubscriptionPlan } = await setupMocks({
      existingSubscription: null,
    });

    const res = await POST(makeReq(), { params: Promise.resolve({ id: TEAM_ID }) });
    const body = await res!.json();

    expect(res!.status).toBe(200);
    expect(body).toEqual({ url: "https://stripe.test/checkout" });
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(changeSubscriptionPlan).not.toHaveBeenCalled();
  });

  it("uses a new Checkout Session for a manual comp with no Stripe subscription id", async () => {
    const { POST, createCheckoutSession, changeSubscriptionPlan } = await setupMocks({
      existingSubscription: {
        planId: OLD_PLAN_ID,
        provider: "manual",
        providerSubscriptionId: undefined,
      },
    });

    const res = await POST(makeReq(), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(res!.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(changeSubscriptionPlan).not.toHaveBeenCalled();
  });

  it("uses a new Checkout Session to resubscribe a team whose subscription was canceled", async () => {
    // Regression test for a P0 found by /impeccable critique: cancelSubscriptionNow
    // flips status to "canceled" but never clears providerSubscriptionId, so
    // the stale id must not itself be enough to route into changeSubscriptionPlan
    // — that path never touches status and would strand the team on "canceled"
    // forever no matter which plan they picked next.
    const { POST, createCheckoutSession, changeSubscriptionPlan } = await setupMocks({
      existingSubscription: {
        planId: OLD_PLAN_ID,
        provider: "stripe",
        providerSubscriptionId: STRIPE_SUB_ID,
        status: "canceled",
      },
    });

    const res = await POST(makeReq(), { params: Promise.resolve({ id: TEAM_ID }) });
    const body = await res!.json();

    expect(res!.status).toBe(200);
    expect(body).toEqual({ url: "https://stripe.test/checkout" });
    expect(createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(changeSubscriptionPlan).not.toHaveBeenCalled();
  });

  it("changes the existing live Stripe subscription in place instead of creating a second one", async () => {
    const { POST, createCheckoutSession, changeSubscriptionPlan, billingEventCreate, enforcePlanLimitsAfterDowngrade, existingDoc } =
      await setupMocks({
        existingSubscription: {
          planId: OLD_PLAN_ID,
          provider: "stripe",
          providerSubscriptionId: STRIPE_SUB_ID,
        },
      });

    const res = await POST(makeReq(), { params: Promise.resolve({ id: TEAM_ID }) });
    const body = await res!.json();

    expect(res!.status).toBe(200);
    expect(body).toEqual({ changed: true });
    expect(changeSubscriptionPlan).toHaveBeenCalledWith(STRIPE_SUB_ID, "price_pro_monthly");
    expect(createCheckoutSession).not.toHaveBeenCalled();

    // Local record updated directly rather than waiting on the async webhook.
    expect(existingDoc!.planId).toBe(PLAN_ID);
    expect(existingDoc!.cancelAtPeriodEnd).toBe(false);
    expect(existingDoc!.save).toHaveBeenCalledTimes(1);

    expect(billingEventCreate).toHaveBeenCalledWith(
      expect.objectContaining({ type: "plan_changed", fromPlanId: OLD_PLAN_ID, toPlanId: PLAN_ID }),
    );
    expect(enforcePlanLimitsAfterDowngrade).toHaveBeenCalledWith(TEAM_ID);
  });

  it("rejects switching to the plan the team is already on", async () => {
    const { POST, changeSubscriptionPlan } = await setupMocks({
      existingSubscription: {
        planId: PLAN_ID,
        provider: "stripe",
        providerSubscriptionId: STRIPE_SUB_ID,
      },
    });

    const res = await POST(makeReq(), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(res!.status).toBe(400);
    expect(changeSubscriptionPlan).not.toHaveBeenCalled();
  });

  it("returns 503 when Stripe is not configured, regardless of existing subscription", async () => {
    const { POST, changeSubscriptionPlan, createCheckoutSession } = await setupMocks({
      existingSubscription: { planId: OLD_PLAN_ID, provider: "stripe", providerSubscriptionId: STRIPE_SUB_ID },
      stripeConfigured: false,
    });

    const res = await POST(makeReq(), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(res!.status).toBe(503);
    expect(changeSubscriptionPlan).not.toHaveBeenCalled();
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });
});

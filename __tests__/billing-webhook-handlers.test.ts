import { beforeEach, describe, expect, it, vi } from "vitest";

const TEAM_ID = "507f1f77bcf86cd799439011";
const PLAN_ID = "507f1f77bcf86cd799439013";
const OLD_PLAN_ID = "507f1f77bcf86cd799439014";
const SUB_ID = "sub_mock_123";

async function setupMocks(options?: {
  billingEventExists?: boolean;
  subscriptionRecord?: any;
  invoiceCreateError?: { code: number } | null;
}) {
  const billingEventFindOne = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(options?.billingEventExists ? { _id: "existing" } : null),
    }),
  });
  const billingEventCreate = vi.fn().mockResolvedValue({ _id: "evt1" });

  const subscriptionFindOneAndUpdate = vi.fn().mockResolvedValue(undefined);

  const record = options?.subscriptionRecord?.record ?? null;
  // findOne() is used two ways in webhookHandlers.ts: `await Subscription.findOne(...)`
  // directly (needs a mutable doc with .save()), and
  // `await Subscription.findOne(...).select(...).lean()` (needs a plain object). The
  // mock object below is a real Promise (resolves to the live doc when awaited
  // directly) with a `.select()` bolted on for the chained-lean call site.
  const liveDoc = record ? { ...record, save: vi.fn().mockResolvedValue(undefined) } : null;
  const subscriptionFindOne = vi.fn().mockReturnValue(
    Object.assign(Promise.resolve(liveDoc), {
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(record) }),
    }),
  );

  const invoiceCreate = options?.invoiceCreateError
    ? vi.fn().mockRejectedValue(options.invoiceCreateError)
    : vi.fn().mockResolvedValue({ _id: "inv1" });

  const enforcePlanLimitsAfterDowngrade = vi.fn().mockResolvedValue(undefined);

  vi.doMock("@/lib/models/BillingEvent", () => ({
    BillingEvent: { findOne: billingEventFindOne, create: billingEventCreate },
  }));
  vi.doMock("@/lib/models/Subscription", () => ({
    Subscription: {
      findOne: subscriptionFindOne,
      findOneAndUpdate: subscriptionFindOneAndUpdate,
    },
  }));
  vi.doMock("@/lib/models/Invoice", () => ({
    Invoice: { create: invoiceCreate },
  }));
  vi.doMock("@/lib/entitlements", () => ({ enforcePlanLimitsAfterDowngrade }));

  const handlers = await import("@/lib/billing/webhookHandlers");

  return {
    handlers,
    billingEventFindOne,
    billingEventCreate,
    subscriptionFindOneAndUpdate,
    subscriptionFindOne,
    invoiceCreate,
    enforcePlanLimitsAfterDowngrade,
    liveDoc,
  };
}

describe("lib/billing/webhookHandlers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("handleCheckoutCompleted", () => {
    it("upserts the Subscription and records a checkout_completed event", async () => {
      const { handlers, subscriptionFindOneAndUpdate, billingEventCreate } = await setupMocks();

      const result = await handlers.handleCheckoutCompleted({
        providerEventId: "evt_1",
        provider: "mock",
        teamId: TEAM_ID,
        planId: PLAN_ID,
        providerCustomerId: "cus_1",
        providerSubscriptionId: SUB_ID,
        status: "active",
        currentPeriodStart: new Date("2026-01-01"),
        currentPeriodEnd: new Date("2026-02-01"),
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
      });

      expect(result.deduped).toBe(false);
      expect(subscriptionFindOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(billingEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: "checkout_completed", teamId: TEAM_ID, toPlanId: PLAN_ID }),
      );
    });

    it("dedupes a redelivered event without writing again", async () => {
      const { handlers, subscriptionFindOneAndUpdate, billingEventCreate } = await setupMocks({
        billingEventExists: true,
      });

      const result = await handlers.handleCheckoutCompleted({
        providerEventId: "evt_1",
        provider: "mock",
        teamId: TEAM_ID,
        planId: PLAN_ID,
        providerCustomerId: "cus_1",
        providerSubscriptionId: SUB_ID,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
      });

      expect(result.deduped).toBe(true);
      expect(subscriptionFindOneAndUpdate).not.toHaveBeenCalled();
      expect(billingEventCreate).not.toHaveBeenCalled();
    });
  });

  describe("handleSubscriptionUpdated", () => {
    it("records plan_changed and enforces limits when the plan differs", async () => {
      const record = { planId: OLD_PLAN_ID, status: "active", teamId: TEAM_ID, pastDueSince: null };
      const { handlers, billingEventCreate, enforcePlanLimitsAfterDowngrade, liveDoc } = await setupMocks({
        subscriptionRecord: { record },
      });

      const result = await handlers.handleSubscriptionUpdated({
        providerEventId: "evt_2",
        providerSubscriptionId: SUB_ID,
        planId: PLAN_ID,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      });

      expect(result.handled).toBe(true);
      expect(billingEventCreate).toHaveBeenCalledWith(
        expect.objectContaining({ type: "plan_changed", fromPlanId: OLD_PLAN_ID, toPlanId: PLAN_ID }),
      );
      expect(enforcePlanLimitsAfterDowngrade).toHaveBeenCalledWith(TEAM_ID);
      expect(liveDoc!.save).toHaveBeenCalledTimes(1);
    });

    it("stamps pastDueSince only on the transition into past_due", async () => {
      const record = { planId: PLAN_ID, status: "active", teamId: TEAM_ID, pastDueSince: null };
      const { handlers, billingEventCreate, liveDoc } = await setupMocks({ subscriptionRecord: { record } });

      await handlers.handleSubscriptionUpdated({
        providerEventId: "evt_3",
        providerSubscriptionId: SUB_ID,
        planId: null,
        status: "past_due",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      });

      expect(liveDoc!.pastDueSince).toBeInstanceOf(Date);
      expect(billingEventCreate).toHaveBeenCalledWith(expect.objectContaining({ type: "payment_failed" }));
    });

    it("reports handled:false when no matching subscription exists", async () => {
      const { handlers } = await setupMocks({ subscriptionRecord: { record: null } });

      const result = await handlers.handleSubscriptionUpdated({
        providerEventId: "evt_4",
        providerSubscriptionId: "sub_missing",
        planId: null,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: false,
      });

      expect(result).toEqual({ deduped: false, handled: false });
    });
  });

  describe("handleSubscriptionDeleted", () => {
    it("cancels the subscription and records a canceled event", async () => {
      const record = { planId: PLAN_ID, status: "active", teamId: TEAM_ID };
      const { handlers, billingEventCreate, liveDoc } = await setupMocks({ subscriptionRecord: { record } });

      const result = await handlers.handleSubscriptionDeleted({
        providerEventId: "evt_5",
        providerSubscriptionId: SUB_ID,
      });

      expect(result.handled).toBe(true);
      expect(liveDoc!.status).toBe("canceled");
      expect(billingEventCreate).toHaveBeenCalledWith(expect.objectContaining({ type: "canceled" }));
    });
  });

  describe("handleInvoicePaymentFailed", () => {
    it("flips status to past_due and issues a failed invoice", async () => {
      const record = { planId: PLAN_ID, status: "active", teamId: TEAM_ID, _id: "sub-doc-1" };
      const { handlers, invoiceCreate, billingEventCreate, liveDoc } = await setupMocks({
        subscriptionRecord: { record },
      });

      const result = await handlers.handleInvoicePaymentFailed({
        providerEventId: "evt_6",
        providerSubscriptionId: SUB_ID,
        providerInvoiceId: "in_1",
        number: "INV-1",
        amountCents: 4900,
        currency: "usd",
        periodStart: new Date(),
        periodEnd: new Date(),
        provider: "mock",
      });

      expect(result.handled).toBe(true);
      expect(liveDoc!.status).toBe("past_due");
      expect(billingEventCreate).toHaveBeenCalledWith(expect.objectContaining({ type: "payment_failed" }));
      expect(invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({ status: "payment_failed" }));
    });
  });

  describe("handleInvoicePaid", () => {
    it("creates a paid Invoice record", async () => {
      const record = { planId: PLAN_ID, status: "active", teamId: TEAM_ID, _id: "sub-doc-1" };
      const { handlers, invoiceCreate } = await setupMocks({ subscriptionRecord: { record } });

      const result = await handlers.handleInvoicePaid({
        providerEventId: "evt_7",
        providerSubscriptionId: SUB_ID,
        providerInvoiceId: "in_2",
        number: "INV-2",
        amountCents: 4900,
        currency: "usd",
        periodStart: new Date(),
        periodEnd: new Date(),
        provider: "mock",
      });

      expect(result).toEqual({ deduped: false, handled: true });
      expect(invoiceCreate).toHaveBeenCalledWith(expect.objectContaining({ status: "paid", providerInvoiceId: "in_2" }));
    });

    it("treats a duplicate-key error on providerInvoiceId as a dedupe, not a crash", async () => {
      const record = { planId: PLAN_ID, status: "active", teamId: TEAM_ID, _id: "sub-doc-1" };
      const { handlers } = await setupMocks({
        subscriptionRecord: { record },
        invoiceCreateError: { code: 11000 },
      });

      const result = await handlers.handleInvoicePaid({
        providerEventId: "evt_8",
        providerSubscriptionId: SUB_ID,
        providerInvoiceId: "in_3",
        number: "INV-3",
        amountCents: 4900,
        currency: "usd",
        periodStart: new Date(),
        periodEnd: new Date(),
        provider: "mock",
      });

      expect(result).toEqual({ deduped: true, handled: true });
    });
  });
});

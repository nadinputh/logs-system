import { beforeEach, describe, expect, it, vi } from "vitest";

const PLAN_ID = "507f1f77bcf86cd799439013";
const TEAM_ID = "507f1f77bcf86cd799439011";

async function setupMocks(options?: {
  session?: any;
  plan?: any;
}) {
  const connectDB = vi.fn().mockResolvedValue(undefined);

  const defaultPlan = {
    _id: PLAN_ID,
    name: "Pro",
    billingCycle: "monthly",
    priceCents: 4900,
    currency: "usd",
    trialDays: 0,
  };
  const plan = options?.plan ?? defaultPlan;
  const planFindById = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(plan) }),
    lean: vi.fn().mockResolvedValue(plan),
  });

  const defaultSession = {
    token: "tok_1",
    teamId: TEAM_ID,
    teamName: "Acme",
    planId: PLAN_ID,
    customerId: undefined,
    successUrl: "http://localhost/success",
    cancelUrl: "http://localhost/cancel",
    trialDays: 0,
    consumedAt: null,
    save: vi.fn().mockResolvedValue(undefined),
  };
  const session = options?.session === null ? null : { ...defaultSession, ...options?.session };
  const mockCheckoutSessionFindOne = vi.fn().mockResolvedValue(session);

  const handleCheckoutCompleted = vi.fn().mockResolvedValue({ deduped: false });
  const handleInvoicePaid = vi.fn().mockResolvedValue({ deduped: false, handled: true });

  vi.doMock("@/lib/db", () => ({ connectDB }));
  vi.doMock("@/lib/models/Plan", () => ({ Plan: { findById: planFindById } }));
  vi.doMock("@/lib/models/MockCheckoutSession", () => ({
    MockCheckoutSession: { findOne: mockCheckoutSessionFindOne },
  }));
  vi.doMock("@/lib/billing/webhookHandlers", () => ({ handleCheckoutCompleted, handleInvoicePaid }));

  const mod = await import("@/lib/billing/mockCheckout");

  return { mod, session, planFindById, handleCheckoutCompleted, handleInvoicePaid, mockCheckoutSessionFindOne };
}

describe("lib/billing/mockCheckout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("success: completes checkout, issues a paid invoice, and redirects to successUrl", async () => {
    const { mod, session, handleCheckoutCompleted, handleInvoicePaid } = await setupMocks();

    const result = await mod.completeMockCheckout("tok_1", "success");

    expect(result.redirectUrl).toBe("http://localhost/success");
    expect(session.consumedAt).toBeInstanceOf(Date);
    expect(handleCheckoutCompleted).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "mock", teamId: TEAM_ID, planId: PLAN_ID, status: "active" }),
    );
    expect(handleInvoicePaid).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 4900, currency: "usd" }));
  });

  it("success with a trial: activates trialing status and skips issuing an invoice", async () => {
    const { mod, handleInvoicePaid, handleCheckoutCompleted } = await setupMocks({ session: { trialDays: 7 } });

    const result = await mod.completeMockCheckout("tok_1", "success");

    expect(result.redirectUrl).toBe("http://localhost/success");
    expect(handleCheckoutCompleted).toHaveBeenCalledWith(expect.objectContaining({ status: "trialing" }));
    expect(handleInvoicePaid).not.toHaveBeenCalled();
  });

  it("decline: leaves the session open (not consumed) and returns no redirect", async () => {
    const { mod, session, handleCheckoutCompleted } = await setupMocks();

    const result = await mod.completeMockCheckout("tok_1", "card_declined");

    expect(result.redirectUrl).toBe("");
    expect(result.declineMessage).toMatch(/declined/i);
    expect(session.consumedAt).toBeNull();
    expect(handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("canceled: consumes the session and redirects to cancelUrl without writing billing state", async () => {
    const { mod, session, handleCheckoutCompleted } = await setupMocks();

    const result = await mod.completeMockCheckout("tok_1", "canceled");

    expect(result.redirectUrl).toBe("http://localhost/cancel");
    expect(session.consumedAt).toBeInstanceOf(Date);
    expect(handleCheckoutCompleted).not.toHaveBeenCalled();
  });

  it("rejects completing an already-consumed session", async () => {
    const { mod } = await setupMocks({ session: { consumedAt: new Date() } });

    await expect(mod.completeMockCheckout("tok_1", "success")).rejects.toThrow(/already completed/i);
  });

  it("rejects an unknown token", async () => {
    const { mod } = await setupMocks({ session: null });

    await expect(mod.completeMockCheckout("nope", "success")).rejects.toThrow(/expired|does not exist/i);
  });
});

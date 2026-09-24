import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("lib/billing/provider — mock vs. Stripe selection", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete process.env.BILLING_MOCK_MODE;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("mockBillingEnabled() requires both BILLING_MOCK_MODE=true and a non-production NODE_ENV", async () => {
    const { mockBillingEnabled } = await import("@/lib/billing/provider");

    vi.stubEnv("NODE_ENV", "development");
    process.env.BILLING_MOCK_MODE = "true";
    expect(mockBillingEnabled()).toBe(true);

    delete process.env.BILLING_MOCK_MODE;
    expect(mockBillingEnabled()).toBe(false);

    process.env.BILLING_MOCK_MODE = "true";
    vi.stubEnv("NODE_ENV", "production");
    expect(mockBillingEnabled()).toBe(false);
  });

  it("getBillingProvider() returns the mock provider when the bypass is active", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.BILLING_MOCK_MODE = "true";

    vi.doMock("@/lib/billing/providers/mock", () => ({ mockProvider: { name: "mock" } }));
    vi.doMock("@/lib/billing/providers/stripe", () => ({ stripeProvider: { name: "stripe" } }));

    const { getBillingProvider } = await import("@/lib/billing/provider");
    const provider = await getBillingProvider();
    expect(provider.name).toBe("mock");
  });

  it("getBillingProvider() returns the Stripe provider when the bypass is off", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.BILLING_MOCK_MODE;

    vi.doMock("@/lib/billing/providers/mock", () => ({ mockProvider: { name: "mock" } }));
    vi.doMock("@/lib/billing/providers/stripe", () => ({ stripeProvider: { name: "stripe" } }));

    const { getBillingProvider } = await import("@/lib/billing/provider");
    const provider = await getBillingProvider();
    expect(provider.name).toBe("stripe");
  });

  it("isBillingConfigured() is true in mock mode even with no Stripe keys set", async () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.BILLING_MOCK_MODE = "true";
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const { isBillingConfigured } = await import("@/lib/billing/provider");
    expect(isBillingConfigured()).toBe(true);
  });

  it("isBillingConfigured() falls back to the real Stripe env check outside mock mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.BILLING_MOCK_MODE;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const { isBillingConfigured } = await import("@/lib/billing/provider");
    expect(isBillingConfigured()).toBe(false);

    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    expect(isBillingConfigured()).toBe(true);
  });
});

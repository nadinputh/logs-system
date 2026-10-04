import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for the IdempotencyKey collection (atomic upsert-claim).
const claims = new Map<string, { body: string }>();
vi.mock("@/lib/db", () => ({ connectDB: async () => {} }));
vi.mock("@/lib/models/IdempotencyKey", () => ({
  IdempotencyKey: {
    findOneAndUpdate: (f: { key: string }, u: { $setOnInsert: { body: string } }) => ({
      lean: async () => {
        const prior = claims.get(f.key) ?? null;
        if (!prior) claims.set(f.key, { body: u.$setOnInsert.body });
        return prior;
      },
    }),
  },
}));

describe("kiosk token", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.KIOSK_SECRET = "k".repeat(32);
  });

  it("round-trips and binds to the location", async () => {
    const { signKioskToken, verifyKioskToken } = await import("@/lib/jwt");
    const t = await signKioskToken("loc1");
    expect(await verifyKioskToken(t)).toMatchObject({ locationId: "loc1", jti: expect.any(String) });
  });

  it("rejects an expired token beyond clock tolerance", async () => {
    const { signKioskToken, verifyKioskToken } = await import("@/lib/jwt");
    const t = await signKioskToken("loc1", "1s");
    await new Promise((r) => setTimeout(r, 7000));
    await expect(verifyKioskToken(t)).rejects.toThrow();
  }, 10000);

  it("fails closed without KIOSK_SECRET", async () => {
    const { signKioskToken, verifyKioskToken } = await import("@/lib/jwt");
    const t = await signKioskToken("loc1");
    delete process.env.KIOSK_SECRET;
    await expect(verifyKioskToken(t)).rejects.toThrow("KIOSK_SECRET");
  });
});

describe("kioskGate", () => {
  beforeEach(() => {
    claims.clear();
    vi.resetModules();
    process.env.KIOSK_SECRET = "k".repeat(32);
  });

  it("allows tokenless check-in unless the location requires a live QR", async () => {
    const { kioskGate } = await import("@/lib/kioskGate");
    expect(await kioskGate({}, "loc1", undefined, "s1")).toBeNull();
    const res = await kioskGate({ requireDynamicQr: true }, "loc1", undefined, "s1");
    expect(res?.status).toBe(403);
  });

  it("accepts a token for this location and rejects one for another", async () => {
    const { kioskGate } = await import("@/lib/kioskGate");
    const { signKioskToken } = await import("@/lib/jwt");
    const t = await signKioskToken("loc1");
    expect(await kioskGate({ requireDynamicQr: true }, "loc1", t, "s1")).toBeNull();
    expect((await kioskGate({}, "loc2", t, "s1"))?.status).toBe(403);
    expect((await kioskGate({}, "loc1", "garbage", "s1"))?.status).toBe(403);
  });

  it("binds a token to the first session that uses it", async () => {
    const { kioskGate } = await import("@/lib/kioskGate");
    const { signKioskToken } = await import("@/lib/jwt");
    const t = await signKioskToken("loc1", "5m");
    expect(await kioskGate({}, "loc1", t, "s1")).toBeNull();
    expect(await kioskGate({}, "loc1", t, "s1")).toBeNull(); // retry, same visitor
    expect((await kioskGate({}, "loc1", t, "s2"))?.status).toBe(403);
  });
});

describe("claimScan", () => {
  beforeEach(() => {
    claims.clear();
    vi.resetModules();
  });

  it("lets the first device reload but refuses a different one", async () => {
    const { claimScan } = await import("@/lib/kioskGate");
    expect(await claimScan("j1", "1.1.1.1|ua")).toBe(true);
    expect(await claimScan("j1", "1.1.1.1|ua")).toBe(true);
    expect(await claimScan("j1", "2.2.2.2|ua")).toBe(false);
  });
});

describe("claim", () => {
  beforeEach(() => {
    claims.clear();
    vi.resetModules();
  });

  it("returns null for the first claimant and the stored value after", async () => {
    const { claim } = await import("@/lib/claim");
    expect(await claim("k1", "a")).toBeNull();
    expect(await claim("k1", "b")).toBe("a");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("kiosk token", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.KIOSK_SECRET = "k".repeat(32);
  });

  it("round-trips and binds to the location", async () => {
    const { signKioskToken, verifyKioskToken } = await import("@/lib/jwt");
    const t = await signKioskToken("loc1");
    expect(await verifyKioskToken(t)).toEqual({ locationId: "loc1" });
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
    vi.resetModules();
    process.env.KIOSK_SECRET = "k".repeat(32);
  });

  it("allows tokenless check-in unless the location requires a live QR", async () => {
    const { kioskGate } = await import("@/lib/kioskGate");
    expect(await kioskGate({}, "loc1")).toBeNull();
    const res = await kioskGate({ requireDynamicQr: true }, "loc1");
    expect(res?.status).toBe(403);
  });

  it("accepts a token for this location and rejects one for another", async () => {
    const { kioskGate } = await import("@/lib/kioskGate");
    const { signKioskToken } = await import("@/lib/jwt");
    const t = await signKioskToken("loc1");
    expect(await kioskGate({ requireDynamicQr: true }, "loc1", t)).toBeNull();
    expect((await kioskGate({}, "loc2", t))?.status).toBe(403);
    expect((await kioskGate({}, "loc1", "garbage"))?.status).toBe(403);
  });
});

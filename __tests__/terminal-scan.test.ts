import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

async function scan(claimResult: string | null) {
  vi.resetModules();
  const create = vi.fn(async (d: any) => ({ ...d, _id: "in1" }));
  vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
  vi.doMock("@/lib/csrf", () => ({ assertSameOrigin: () => null }));
  vi.doMock("@/lib/realtime/logEvents", () => ({ publishLogCreated: vi.fn() }));
  vi.doMock("@/lib/jwt", () => ({ verifySessionQrToken: async () => ({ userId: "u1", jti: "j1" }) }));
  vi.doMock("@/lib/claim", () => ({ claim: async () => claimResult }));
  vi.doMock("@/lib/checkInLock", () => ({ acquireCheckInLock: async () => async () => {} }));
  vi.doMock("@/lib/locationOwnership", () => ({ findOwnedLocationByType: async () => ({ teamId: "t" }) }));
  vi.doMock("@/lib/middleware/auth", () => ({ requireTeamPermission: async () => ({}) }));
  vi.doMock("@/lib/models/User", () => ({ User: { findById: () => ({ lean: async () => ({ name: "A" }) }) } }));
  vi.doMock("@/lib/models/Log", () => ({ Log: { findOne: () => ({ sort: async () => null }), create } }));
  process.env.SESSION_QR_SECRET = "s";
  const { POST } = await import("@/app/api/terminal/scan/route");
  const res = await POST(
    new NextRequest("http://localhost/api/terminal/scan", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost", host: "localhost" },
      body: JSON.stringify({ token: "t", locationId: "l", locationType: "room" }),
    }),
  );
  return { res, create };
}

describe("terminal scan", () => {
  it("checks the user in on a fresh token", async () => {
    const { res, create } = await scan(null);
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
  });

  it("refuses a replayed session QR token", async () => {
    const { res, create } = await scan("u1");
    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });
});

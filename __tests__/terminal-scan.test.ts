import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

async function scan(
  claimResult: string | null,
  opts: { authError?: boolean; authTeam?: string; member?: boolean } = {},
) {
  vi.resetModules();
  const create = vi.fn(async (d: any) => ({ ...d, _id: "in1" }));
  vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
  vi.doMock("@/lib/csrf", () => ({ assertSameOrigin: () => null }));
  vi.doMock("@/lib/realtime/logEvents", () => ({ publishLogCreated: vi.fn() }));
  vi.doMock("@/lib/jwt", () => ({ verifySessionQrToken: async () => ({ userId: "u1", jti: "j1" }) }));
  vi.doMock("@/lib/claim", () => ({ claim: async () => claimResult }));
  vi.doMock("@/lib/checkInLock", () => ({ acquireCheckInLock: async () => async () => {} }));
  const locationLookup = vi.fn(async () => ({ teamId: "t" }));
  vi.doMock("@/lib/locationOwnership", () => ({ findOwnedLocationByType: locationLookup }));
  vi.doMock("@/lib/middleware/auth", () => ({
    requireTeamPermission: async () =>
      opts.authError
        ? { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) }
        : { error: null, teamId: opts.authTeam ?? "t" },
  }));
  vi.doMock("@/lib/models/TeamMember", () => ({
    TeamMember: { exists: async () => (opts.member === false ? null : { _id: "m" }) },
  }));
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
  return { res, create, locationLookup };
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

  it("authenticates before looking anything up (no existence oracle)", async () => {
    const { res, locationLookup } = await scan(null, { authError: true });
    expect(res.status).toBe(401);
    expect(locationLookup).not.toHaveBeenCalled();
  });

  it("treats a location in another team as not found", async () => {
    const { res, create } = await scan(null, { authTeam: "other" });
    expect(res.status).toBe(404);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses to check in a user who is not an active member of the team", async () => {
    const { res, create } = await scan(null, { member: false });
    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});

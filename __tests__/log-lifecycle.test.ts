import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SESSION = "11111111-1111-4111-8111-111111111111";
const hdr = { "content-type": "application/json", origin: "http://localhost", host: "localhost", "idempotency-key": "k" };

async function patchRoute(opts: { checkin: any; mode?: string; cached?: any; existingOut?: any }) {
  vi.resetModules();
  const create = vi.fn(async (d: any) => ({ ...d, _id: "out2", toObject() { return { ...d, _id: "out2" }; } }));
  vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
  vi.doMock("@/lib/csrf", () => ({ assertSameOrigin: () => null }));
  vi.doMock("@/lib/realtime/logEvents", () => ({ publishLogCreated: vi.fn() }));
  vi.doMock("@/lib/idempotency", () => ({
    checkIdempotency: vi.fn(async () => opts.cached ?? null),
    saveIdempotency: vi.fn(),
  }));
  vi.doMock("@/lib/locationOwnership", () => ({
    findOwnedLocationByType: vi.fn(async () => ({ checkInMode: opts.mode ?? "click" })),
  }));
  vi.doMock("@/lib/models/Log", () => ({
    Log: {
      findOne: vi.fn(async (q: any) => (q.action === "in" ? opts.checkin : opts.existingOut ?? null)),
      create,
    },
  }));
  const { PATCH } = await import("@/app/api/logs/[id]/route");
  const call = () =>
    PATCH(
      new NextRequest("http://localhost/api/logs/in2", { method: "PATCH", headers: hdr, body: JSON.stringify({ sessionToken: SESSION }) }),
      { params: Promise.resolve({ id: "in2" }) },
    );
  return { call, create };
}

const checkin = (extra = {}) => ({ _id: "in2", teamId: "t", locationId: "l", locationType: "room", sessionToken: SESSION, ...extra });

describe("check-out", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not replay another visit's cached check-out on the same day", async () => {
    const { call, create } = await patchRoute({
      checkin: checkin(),
      cached: { statusCode: 201, body: { _id: "out1", relatedLogId: "in1" } },
    });
    const res = await call();
    expect(create).toHaveBeenCalledOnce();
    expect(res.status).toBe(201);
  });

  it("replays the cached check-out of this same check-in", async () => {
    const { call, create } = await patchRoute({
      checkin: checkin(),
      cached: { statusCode: 201, body: { _id: "out1", relatedLogId: "in2" } },
    });
    expect((await call()).status).toBe(201);
    expect(create).not.toHaveBeenCalled();
  });

  it("lets a click check-in be closed after the location switched to passkey", async () => {
    const { call, create } = await patchRoute({ checkin: checkin({ passkeyVerified: false }), mode: "passkey" });
    expect((await call()).status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
  });

  it("still demands a passkey for a passkey-verified check-in", async () => {
    const { call } = await patchRoute({ checkin: checkin({ passkeyVerified: true }), mode: "passkey" });
    expect((await call()).status).toBe(403);
  });

  it("never returns ip or user agent to the visitor", async () => {
    const { call } = await patchRoute({ checkin: checkin() });
    const body = await (await call()).json();
    expect(body).not.toHaveProperty("ipAddress");
    expect(body).not.toHaveProperty("userAgent");
  });
});

function mockCheckInDeps(lock: () => Promise<(() => Promise<void>) | null> = async () => async () => {}) {
  vi.doMock("@/lib/rateLimitShared", () => ({ rateLimitShared: async () => ({ ok: true }) }));
  vi.doMock("@/lib/checkInLock", () => ({ acquireCheckInLock: lock }));
}

describe("check-in", () => {
  it("answers 409 when another check-in for the same visitor holds the lock", async () => {
    vi.resetModules();
    mockCheckInDeps(async () => null);
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
    vi.doMock("@/lib/csrf", () => ({ assertSameOrigin: () => null }));
    vi.doMock("@/lib/realtime/logEvents", () => ({ publishLogCreated: vi.fn() }));
    vi.doMock("@/lib/kioskGate", () => ({ kioskGate: async () => null }));
    vi.doMock("@/lib/geofence", () => ({ resolveBuildingId: () => null, computeGeofenceStatus: async () => undefined }));
    vi.doMock("@/lib/middleware/auth", () => ({ requireTeamPermission: async () => ({}), requireTeamAccess: async () => ({}) }));
    vi.doMock("@/lib/idempotency", () => ({ checkIdempotency: async () => null, saveIdempotency: vi.fn() }));
    vi.doMock("@/lib/locationOwnership", () => ({ findOwnedLocationByType: async () => ({ teamId: "t", checkInMode: "click" }) }));
    for (const m of ["AuditLog", "User", "TeamMember"]) vi.doMock(`@/lib/models/${m}`, () => ({ [m]: {} }));
    const create = vi.fn();
    vi.doMock("@/lib/models/Log", () => ({ Log: { exists: async () => null, findOne: () => ({ sort: async () => null }), create } }));
    const { POST } = await import("@/app/api/logs/route");
    const res = await POST(
      new NextRequest("http://localhost/api/logs", {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ locationId: "l", locationType: "room", sessionToken: SESSION }),
      }),
    );
    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("writes a new visit when the cached check-in already has a check-out", async () => {
    vi.resetModules();
    mockCheckInDeps();
    const create = vi.fn(async (d: any) => ({ ...d, _id: "in2", toObject() { return { ...d, _id: "in2" }; } }));
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
    vi.doMock("@/lib/csrf", () => ({ assertSameOrigin: () => null }));
    vi.doMock("@/lib/realtime/logEvents", () => ({ publishLogCreated: vi.fn() }));
    vi.doMock("@/lib/kioskGate", () => ({ kioskGate: async () => null }));
    vi.doMock("@/lib/geofence", () => ({ resolveBuildingId: () => null, computeGeofenceStatus: async () => undefined }));
    vi.doMock("@/lib/middleware/auth", () => ({
      requireTeamPermission: async () => ({}),
      requireTeamAccess: async () => ({}),
    }));
    vi.doMock("@/lib/idempotency", () => ({
      checkIdempotency: async () => ({ statusCode: 201, body: { _id: "in1" } }),
      saveIdempotency: vi.fn(),
    }));
    vi.doMock("@/lib/locationOwnership", () => ({
      findOwnedLocationByType: async () => ({ teamId: "t", checkInMode: "click" }),
    }));
    for (const m of ["AuditLog", "User", "TeamMember"]) {
      vi.doMock(`@/lib/models/${m}`, () => ({ [m]: {} }));
    }
    vi.doMock("@/lib/models/Log", () => ({
      Log: {
        exists: async () => ({ _id: "out1" }), // in1 was closed: stale key
        findOne: () => ({ sort: async () => null }),
        create,
      },
    }));
    const { POST } = await import("@/app/api/logs/route");
    const res = await POST(
      new NextRequest("http://localhost/api/logs", {
        method: "POST",
        headers: { ...hdr, "x-forwarded-for": "9.9.9.9" },
        body: JSON.stringify({ locationId: "l", locationType: "room", sessionToken: SESSION }),
      }),
    );
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledOnce();
  });
});

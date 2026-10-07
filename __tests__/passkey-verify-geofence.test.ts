import { beforeEach, describe, expect, it, vi } from "vitest";

// Check-in takes a per-visitor lock in MongoDB; these tests have no database.
vi.mock("@/lib/checkInLock", () => ({ acquireCheckInLock: async () => async () => {} }));
import { NextRequest } from "next/server";

const TEAM_ID = "507f1f77bcf86cd799439011";
const BUILDING_ID = "507f1f77bcf86cd799439012";
const USER_ID = "507f1f77bcf86cd799439013";

function clientDataJSON(challenge: string) {
  return Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: "http://localhost:4242" })).toString(
    "base64url",
  );
}

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/logs/passkey/verify", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/logs/passkey/verify — geofence wiring on check-in", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupMocks(options?: {
    location?: unknown;
    geofenceStatus?: boolean | undefined;
    isMember?: boolean;
  }) {
    const hasLocationOverride = !!options && Object.prototype.hasOwnProperty.call(options, "location");
    const location = hasLocationOverride
      ? options?.location
      : { _id: BUILDING_ID, teamId: TEAM_ID, buildingId: undefined };

    const findOwnedLocationByType = vi.fn().mockResolvedValue(location);
    const resolveBuildingId = vi.fn().mockReturnValue(BUILDING_ID);
    const computeGeofenceStatus = vi.fn().mockResolvedValue(options?.geofenceStatus);

    const logCreate = vi.fn().mockResolvedValue({
      toObject: () => ({ _id: "log-1" }),
      _id: "log-1",
    });
    const logFindOne = vi.fn().mockReturnValue({ sort: () => Promise.resolve(null) });

    const staffCred = {
      _id: "cred-1",
      userId: USER_ID,
      credentialId: "cred-id-1",
      publicKey: Buffer.from("fake-pubkey").toString("base64url"),
      counter: 0,
      transports: ["internal"],
    };

    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/models/Log", () => ({ Log: { findOne: logFindOne, create: logCreate } }));
    vi.doMock("@/lib/models/PasskeyCredential", () => ({
      PasskeyCredential: {
        findOne: vi.fn().mockResolvedValue(staffCred),
        updateOne: vi.fn().mockResolvedValue(undefined),
      },
    }));
    vi.doMock("@/lib/models/TeamMember", () => ({
      TeamMember: { exists: vi.fn().mockResolvedValue(options?.isMember === false ? null : { _id: "m1" }) },
    }));
    vi.doMock("@/lib/models/VisitorPasskeyCredential", () => ({
      VisitorPasskeyCredential: { findOne: vi.fn().mockResolvedValue(null), updateOne: vi.fn() },
    }));
    vi.doMock("@/lib/models/PasskeyCheckInChallenge", () => ({
      PasskeyCheckInChallenge: {
        findOne: vi.fn().mockResolvedValue({
          _id: "challenge-1",
          challenge: "test-challenge",
          teamId: TEAM_ID,
          locationId: BUILDING_ID,
          locationType: "building",
          action: "in",
          sessionToken: "550e8400-e29b-41d4-a716-446655440000",
          idempotencyKey: "idem-1",
          visitorName: "Alice",
        }),
        deleteOne: vi.fn().mockResolvedValue(undefined),
      },
    }));
    vi.doMock("@/lib/idempotency", () => ({
      checkIdempotency: vi.fn().mockResolvedValue(null),
      saveIdempotency: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/realtime/logEvents", () => ({ publishLogCreated: vi.fn() }));
    vi.doMock("@/lib/server/getClientIp", () => ({ getClientIp: vi.fn().mockReturnValue("127.0.0.1") }));
    vi.doMock("@simplewebauthn/server", () => ({
      verifyAuthenticationResponse: vi.fn().mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 1 },
      }),
    }));
    vi.doMock("@/lib/locationOwnership", () => ({ findOwnedLocationByType }));
    vi.doMock("@/lib/geofence", () => ({ resolveBuildingId, computeGeofenceStatus }));

    const { POST } = await import("@/app/api/logs/passkey/verify/route");
    return { POST, findOwnedLocationByType, resolveBuildingId, computeGeofenceStatus, logCreate };
  }

  it("resolves the building and threads geofenceStatus into Log.create", async () => {
    const { POST, findOwnedLocationByType, resolveBuildingId, computeGeofenceStatus, logCreate } =
      await setupMocks({ geofenceStatus: true });

    const res = await POST(
      makeReq({
        response: { id: "cred-id-1", response: { clientDataJSON: clientDataJSON("test-challenge") } },
        locationId: BUILDING_ID,
        locationType: "building",
        action: "in",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
        idempotencyKey: "idem-1",
        latitude: 11.5564,
        longitude: 104.9282,
      }),
    );

    expect(res.status).toBe(201);
    expect(findOwnedLocationByType).toHaveBeenCalledWith("building", BUILDING_ID);
    expect(resolveBuildingId).toHaveBeenCalledWith("building", expect.objectContaining({ _id: BUILDING_ID }));
    expect(computeGeofenceStatus).toHaveBeenCalledWith(BUILDING_ID, 11.5564, 104.9282);
    expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({ geofenceStatus: true }));
  });

  it("never blocks the check-in when the location can't be resolved — geofenceStatus is just undefined", async () => {
    const { POST, computeGeofenceStatus, logCreate } = await setupMocks({ location: null });

    const res = await POST(
      makeReq({
        response: { id: "cred-id-1", response: { clientDataJSON: clientDataJSON("test-challenge") } },
        locationId: BUILDING_ID,
        locationType: "building",
        action: "in",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
        idempotencyKey: "idem-1",
        latitude: 11.5564,
        longitude: 104.9282,
      }),
    );

    expect(res.status).toBe(201);
    expect(computeGeofenceStatus).not.toHaveBeenCalled();
    expect(logCreate).toHaveBeenCalledWith(expect.objectContaining({ geofenceStatus: undefined }));
  });

  it("passes undefined coordinates through when the client sent none", async () => {
    const { POST, computeGeofenceStatus } = await setupMocks({ geofenceStatus: undefined });

    await POST(
      makeReq({
        response: { id: "cred-id-1", response: { clientDataJSON: clientDataJSON("test-challenge") } },
        locationId: BUILDING_ID,
        locationType: "building",
        action: "in",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
        idempotencyKey: "idem-1",
      }),
    );

    expect(computeGeofenceStatus).toHaveBeenCalledWith(BUILDING_ID, undefined, undefined);
  });

  it("treats a staff passkey from outside the team as unregistered and writes nothing", async () => {
    const { POST, logCreate } = await setupMocks({ isMember: false });

    const res = await POST(
      makeReq({
        response: { id: "cred-id-1", response: { clientDataJSON: clientDataJSON("test-challenge") } },
        locationId: BUILDING_ID,
        locationType: "building",
        action: "in",
        sessionToken: "550e8400-e29b-41d4-a716-446655440000",
        idempotencyKey: "idem-1",
      }),
    );

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("PASSKEY_NOT_REGISTERED");
    expect(logCreate).not.toHaveBeenCalled();
  });
});

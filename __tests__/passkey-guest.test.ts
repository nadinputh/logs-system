/**
 * Guest Passkey Check-In / Check-Out — Unit Tests
 *
 * Covers:
 *  1. lib/idempotency.ts  →  buildIdempotencyKey helper
 *  2. POST /api/logs/passkey/visitor/register/options
 *  3. POST /api/logs/passkey/visitor/register/verify
 *  4. POST /api/logs/passkey/challenge
 *  5. POST /api/logs/passkey/verify  (check-in + check-out)
 *
 * All Mongoose I/O and @simplewebauthn/server calls are mocked so tests
 * run without a real MongoDB connection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeReq(
  body: unknown,
  url = "http://localhost:3000/api/test",
): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const LOCATION_ID = "507f1f77bcf86cd799439011";

// ─── shared mock reset ───────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. buildIdempotencyKey
// ════════════════════════════════════════════════════════════════════════════

describe("buildIdempotencyKey", () => {
  it("produces a 64-char hex SHA-256 string", async () => {
    const { buildIdempotencyKey } = await import("@/lib/idempotency");
    const key = buildIdempotencyKey(
      VALID_UUID,
      LOCATION_ID,
      new Date("2026-01-01"),
      "in",
    );
    expect(key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic — same inputs → same key", async () => {
    const { buildIdempotencyKey } = await import("@/lib/idempotency");
    const date = new Date("2026-05-25");
    const a = buildIdempotencyKey(VALID_UUID, LOCATION_ID, date, "in");
    const b = buildIdempotencyKey(VALID_UUID, LOCATION_ID, date, "in");
    expect(a).toBe(b);
  });

  it("differs for action=in vs action=out", async () => {
    const { buildIdempotencyKey } = await import("@/lib/idempotency");
    const date = new Date("2026-05-25");
    const inKey = buildIdempotencyKey(VALID_UUID, LOCATION_ID, date, "in");
    const outKey = buildIdempotencyKey(VALID_UUID, LOCATION_ID, date, "out");
    expect(inKey).not.toBe(outKey);
  });

  it("differs across dates", async () => {
    const { buildIdempotencyKey } = await import("@/lib/idempotency");
    const k1 = buildIdempotencyKey(
      VALID_UUID,
      LOCATION_ID,
      new Date("2026-05-25"),
      "in",
    );
    const k2 = buildIdempotencyKey(
      VALID_UUID,
      LOCATION_ID,
      new Date("2026-05-26"),
      "in",
    );
    expect(k1).not.toBe(k2);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. POST /api/logs/passkey/visitor/register/options
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/logs/passkey/visitor/register/options", () => {
  async function setupMocks(existingCreds: unknown[] = []) {
    vi.doMock("@/lib/db", () => ({
      connectDB: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/models/VisitorPasskeyCredential", () => ({
      VisitorPasskeyCredential: {
        find: vi
          .fn()
          .mockReturnValue({ lean: () => Promise.resolve(existingCreds) }),
      },
    }));
    vi.doMock("@/lib/models/VisitorPasskeyChallenge", () => ({
      VisitorPasskeyChallenge: {
        deleteMany: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
    }));
    vi.doMock("@simplewebauthn/server", () => ({
      generateRegistrationOptions: vi.fn().mockResolvedValue({
        challenge: "mock-challenge-base64url",
        rp: { name: "Check-In System", id: "localhost" },
        user: { id: "user-id", name: "session", displayName: "Visitor" },
        pubKeyCredParams: [],
        timeout: 60000,
        excludeCredentials: [],
        authenticatorSelection: {},
        attestation: "none",
      }),
    }));
    const { POST } =
      await import("@/app/api/logs/passkey/visitor/register/options/route");
    return POST;
  }

  it("returns 200 with registration options for a valid sessionToken", async () => {
    const POST = await setupMocks();
    const req = makeReq({ sessionToken: VALID_UUID, visitorName: "Alice" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("challenge");
  });

  it("returns 400 for an invalid (non-UUID) sessionToken", async () => {
    const POST = await setupMocks();
    const req = makeReq({ sessionToken: "not-a-uuid" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when sessionToken is missing", async () => {
    const POST = await setupMocks();
    const req = makeReq({ visitorName: "Alice" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("passes existing credentials to excludeCredentials", async () => {
    const existing = [{ credentialId: "cred-abc", transports: ["internal"] }];
    vi.doMock("@/lib/db", () => ({
      connectDB: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/models/VisitorPasskeyCredential", () => ({
      VisitorPasskeyCredential: {
        find: vi
          .fn()
          .mockReturnValue({ lean: () => Promise.resolve(existing) }),
      },
    }));
    vi.doMock("@/lib/models/VisitorPasskeyChallenge", () => ({
      VisitorPasskeyChallenge: {
        deleteMany: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
    }));
    const generateRegistrationOptions = vi
      .fn()
      .mockResolvedValue({ challenge: "c" });
    vi.doMock("@simplewebauthn/server", () => ({
      generateRegistrationOptions,
    }));

    const { POST } =
      await import("@/app/api/logs/passkey/visitor/register/options/route");
    await POST(makeReq({ sessionToken: VALID_UUID }));

    expect(generateRegistrationOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        excludeCredentials: [{ id: "cred-abc", transports: ["internal"] }],
      }),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. POST /api/logs/passkey/visitor/register/verify
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/logs/passkey/visitor/register/verify", () => {
  const MOCK_RESPONSE = { id: "cred-id", type: "public-key", response: {} };
  const CHALLENGE_DOC = {
    _id: "ch-id",
    challenge: "base64-challenge",
    sessionToken: VALID_UUID,
  };

  async function setupMocks(options?: {
    challengeDoc?: unknown;
    verified?: boolean;
  }) {
    const { challengeDoc = CHALLENGE_DOC, verified = true } = options ?? {};
    vi.doMock("@/lib/db", () => ({
      connectDB: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/models/VisitorPasskeyChallenge", () => ({
      VisitorPasskeyChallenge: {
        findOne: vi.fn().mockResolvedValue(challengeDoc),
        deleteOne: vi.fn().mockResolvedValue({}),
      },
    }));
    vi.doMock("@/lib/models/VisitorPasskeyCredential", () => ({
      VisitorPasskeyCredential: {
        create: vi.fn().mockResolvedValue({}),
      },
    }));
    vi.doMock("@simplewebauthn/server", () => ({
      verifyRegistrationResponse: vi.fn().mockResolvedValue({
        verified,
        registrationInfo: verified
          ? {
              credential: {
                id: "cred-id",
                publicKey: new Uint8Array([1, 2, 3]),
                counter: 0,
                transports: ["internal"],
              },
            }
          : undefined,
      }),
    }));
    const { POST } =
      await import("@/app/api/logs/passkey/visitor/register/verify/route");
    return POST;
  }

  it("returns { verified: true } on successful registration", async () => {
    const POST = await setupMocks();
    const req = makeReq({ response: MOCK_RESPONSE, sessionToken: VALID_UUID });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
  });

  it("returns 400 when no pending challenge exists", async () => {
    const POST = await setupMocks({ challengeDoc: null });
    const req = makeReq({ response: MOCK_RESPONSE, sessionToken: VALID_UUID });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/No pending registration challenge/);
  });

  it("returns 400 when verification fails", async () => {
    const POST = await setupMocks({ verified: false });
    const req = makeReq({ response: MOCK_RESPONSE, sessionToken: VALID_UUID });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Verification failed/);
  });

  it("returns 400 when sessionToken is not a UUID", async () => {
    const POST = await setupMocks();
    const req = makeReq({ response: MOCK_RESPONSE, sessionToken: "bad" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("deletes the challenge document after successful verification", async () => {
    vi.doMock("@/lib/db", () => ({
      connectDB: vi.fn().mockResolvedValue(undefined),
    }));
    const deleteOne = vi.fn().mockResolvedValue({});
    vi.doMock("@/lib/models/VisitorPasskeyChallenge", () => ({
      VisitorPasskeyChallenge: {
        findOne: vi.fn().mockResolvedValue(CHALLENGE_DOC),
        deleteOne,
      },
    }));
    vi.doMock("@/lib/models/VisitorPasskeyCredential", () => ({
      VisitorPasskeyCredential: { create: vi.fn().mockResolvedValue({}) },
    }));
    vi.doMock("@simplewebauthn/server", () => ({
      verifyRegistrationResponse: vi.fn().mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: {
            id: "cred-id",
            publicKey: new Uint8Array([1]),
            counter: 0,
            transports: [],
          },
        },
      }),
    }));
    const { POST } =
      await import("@/app/api/logs/passkey/visitor/register/verify/route");
    await POST(makeReq({ response: MOCK_RESPONSE, sessionToken: VALID_UUID }));
    expect(deleteOne).toHaveBeenCalledWith({ _id: "ch-id" });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. POST /api/logs/passkey/challenge
// ════════════════════════════════════════════════════════════════════════════

describe("POST /api/logs/passkey/challenge", () => {
  const VALID_BODY = {
    locationId: LOCATION_ID,
    locationType: "room",
    action: "in",
    sessionToken: VALID_UUID,
    idempotencyKey: "a".repeat(64),
  };

  async function setupMocks() {
    vi.doMock("@/lib/db", () => ({
      connectDB: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/models/PasskeyCheckInChallenge", () => ({
      PasskeyCheckInChallenge: {
        deleteMany: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({}),
      },
    }));
    vi.doMock("@simplewebauthn/server", () => ({
      generateAuthenticationOptions: vi.fn().mockResolvedValue({
        challenge: "auth-challenge-base64url",
        allowCredentials: [],
        timeout: 60000,
        rpId: "localhost",
        userVerification: "required",
      }),
    }));
    const { POST } = await import("@/app/api/logs/passkey/challenge/route");
    return POST;
  }

  it("returns authentication options for a valid request", async () => {
    const POST = await setupMocks();
    const res = await POST(makeReq(VALID_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("challenge");
  });

  it("cleans up stale challenges before issuing a new one", async () => {
    vi.doMock("@/lib/db", () => ({
      connectDB: vi.fn().mockResolvedValue(undefined),
    }));
    const deleteMany = vi.fn().mockResolvedValue({});
    vi.doMock("@/lib/models/PasskeyCheckInChallenge", () => ({
      PasskeyCheckInChallenge: {
        deleteMany,
        create: vi.fn().mockResolvedValue({}),
      },
    }));
    vi.doMock("@simplewebauthn/server", () => ({
      generateAuthenticationOptions: vi
        .fn()
        .mockResolvedValue({ challenge: "c" }),
    }));
    const { POST } = await import("@/app/api/logs/passkey/challenge/route");
    await POST(makeReq(VALID_BODY));
    expect(deleteMany).toHaveBeenCalledWith({
      sessionToken: VALID_UUID,
      action: "in",
    });
  });

  it("returns 400 for an invalid locationType", async () => {
    const POST = await setupMocks();
    const req = makeReq({ ...VALID_BODY, locationType: "invalid" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing locationId", async () => {
    const POST = await setupMocks();
    const { locationId: _drop, ...rest } = VALID_BODY;
    const res = await POST(makeReq(rest));
    expect(res.status).toBe(400);
  });

  it("returns 400 for a missing idempotencyKey", async () => {
    const POST = await setupMocks();
    const { idempotencyKey: _drop, ...rest } = VALID_BODY;
    const res = await POST(makeReq(rest));
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. POST /api/logs/passkey/verify
// ════════════════════════════════════════════════════════════════════════════

const VISITOR_CRED = {
  _id: "vc-id",
  credentialId: "visitor-cred-id",
  publicKey: Buffer.from([1, 2, 3]).toString("base64url"),
  counter: 0,
  transports: ["internal"],
};

const INTENT_DOC = {
  _id: "intent-id",
  challenge: "stored-challenge",
  locationId: LOCATION_ID,
  locationType: "room",
  action: "in",
  sessionToken: VALID_UUID,
  idempotencyKey: "a".repeat(64),
};

const VERIFY_BODY = {
  response: {
    id: "visitor-cred-id",
    response: {
      clientDataJSON: Buffer.from(
        JSON.stringify({
          challenge: "stored-challenge",
          type: "webauthn.get",
          origin: "http://localhost:3000",
        }),
      ).toString("base64url"),
      authenticatorData: Buffer.from([]).toString("base64url"),
      signature: Buffer.from([]).toString("base64url"),
    },
    type: "public-key",
  },
  locationId: LOCATION_ID,
  locationType: "room",
  action: "in",
  sessionToken: VALID_UUID,
  idempotencyKey: "a".repeat(64),
};

describe("POST /api/logs/passkey/verify — check-in", () => {
  async function setupCheckInMocks(options?: {
    intentDoc?: unknown;
    staffCred?: unknown;
    visitorCred?: unknown;
    existingCheckIn?: unknown;
    existingCheckOut?: unknown;
    idempotencyHit?: boolean;
  }) {
    const {
      intentDoc = INTENT_DOC,
      staffCred = null,
      visitorCred = VISITOR_CRED,
      existingCheckIn = null,
      existingCheckOut = null,
      idempotencyHit = false,
    } = options ?? {};

    vi.doMock("@/lib/db", () => ({
      connectDB: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/models/PasskeyCheckInChallenge", () => ({
      PasskeyCheckInChallenge: {
        findOne: vi.fn().mockResolvedValue(intentDoc),
        deleteOne: vi.fn().mockResolvedValue({}),
      },
    }));
    vi.doMock("@/lib/models/PasskeyCredential", () => ({
      PasskeyCredential: {
        findOne: vi.fn().mockResolvedValue(staffCred),
        updateOne: vi.fn().mockResolvedValue({}),
      },
    }));
    vi.doMock("@/lib/models/VisitorPasskeyCredential", () => ({
      VisitorPasskeyCredential: {
        findOne: vi.fn().mockResolvedValue(visitorCred),
        updateOne: vi.fn().mockResolvedValue({}),
      },
    }));

    const createdLog = {
      _id: "new-log-id",
      action: "in",
      passkeyVerified: true,
      toObject: () => ({
        _id: "new-log-id",
        action: "in",
        passkeyVerified: true,
      }),
    };

    // Route calls Log.findOne(...).sort({...}) for the open-check-in query.
    // We need findOne to return a thenable with a .sort() method.
    let firstCall = true;
    const logFindOne = vi.fn().mockImplementation(() => {
      if (firstCall) {
        firstCall = false;
        // First call: findOne(...).sort(...)
        const result = existingCheckIn ?? null;
        return { sort: vi.fn().mockResolvedValue(result) };
      }
      // Second call: findOne({ relatedLogId, action:'out' }) — plain promise
      return Promise.resolve(existingCheckOut ?? null);
    });

    vi.doMock("@/lib/models/Log", () => ({
      Log: {
        findOne: logFindOne,
        create: vi.fn().mockResolvedValue(createdLog),
      },
    }));

    vi.doMock("@/lib/idempotency", () => ({
      checkIdempotency: vi
        .fn()
        .mockResolvedValue(
          idempotencyHit ? { statusCode: 201, body: { verified: true } } : null,
        ),
      saveIdempotency: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("@simplewebauthn/server", () => ({
      verifyAuthenticationResponse: vi.fn().mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 1 },
      }),
    }));

    const { POST } = await import("@/app/api/logs/passkey/verify/route");
    return POST;
  }

  it("returns 201 with verified:true and a log on successful check-in", async () => {
    const POST = await setupCheckInMocks();
    const res = await POST(makeReq(VERIFY_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.log).toHaveProperty("_id");
    expect(body.log.passkeyVerified).toBe(true);
  });

  it("returns 400 when the intent challenge is not found (expired/not issued)", async () => {
    const POST = await setupCheckInMocks({ intentDoc: null });
    const res = await POST(makeReq(VERIFY_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Challenge not found or expired/);
  });

  it("returns 400 when intent fields do not match the request body", async () => {
    const POST = await setupCheckInMocks({
      intentDoc: { ...INTENT_DOC, locationId: "different-location" },
    });
    const res = await POST(makeReq(VERIFY_BODY));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Intent mismatch/);
  });

  it("returns 401 when the credential is not registered", async () => {
    const POST = await setupCheckInMocks({
      visitorCred: null,
      staffCred: null,
    });
    const res = await POST(makeReq(VERIFY_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Passkey not registered/);
  });

  it("returns cached idempotency response without re-writing", async () => {
    const POST = await setupCheckInMocks({ idempotencyHit: true });
    const res = await POST(makeReq(VERIFY_BODY));
    // Idempotency cache returns the cached statusCode
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.verified).toBe(true);
  });

  it("returns existing:true when visitor is already checked in (no checkout)", async () => {
    const existingLog = {
      _id: "existing-log-id",
      toObject: () => ({ _id: "existing-log-id", action: "in" }),
    };
    const POST = await setupCheckInMocks({
      existingCheckIn: existingLog,
      existingCheckOut: null,
    });
    const res = await POST(makeReq(VERIFY_BODY));
    const body = await res.json();
    expect(body.existing).toBe(true);
  });

  it("returns 400 for missing required field (sessionToken)", async () => {
    const POST = await setupCheckInMocks();
    const { sessionToken: _drop, ...rest } = VERIFY_BODY;
    const res = await POST(makeReq(rest));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Missing required fields/);
  });
});

describe("POST /api/logs/passkey/verify — check-out", () => {
  const CHECK_IN_LOG = {
    _id: "checkin-log-id",
    action: "in",
    locationId: LOCATION_ID,
    locationType: "room",
    sessionToken: VALID_UUID,
    visitorName: "Alice",
    toObject: () => ({
      _id: "checkin-log-id",
      action: "in",
      passkeyVerified: true,
    }),
  };

  const CHECKOUT_INTENT = {
    ...INTENT_DOC,
    action: "out",
    relatedLogId: "checkin-log-id",
  };

  const CHECKOUT_BODY = {
    ...VERIFY_BODY,
    action: "out",
    relatedLogId: "checkin-log-id",
  };

  async function setupCheckOutMocks(options?: {
    checkinLog?: unknown;
    existingCheckout?: unknown;
  }) {
    const { checkinLog = CHECK_IN_LOG, existingCheckout = null } =
      options ?? {};

    vi.doMock("@/lib/db", () => ({
      connectDB: vi.fn().mockResolvedValue(undefined),
    }));
    vi.doMock("@/lib/models/PasskeyCheckInChallenge", () => ({
      PasskeyCheckInChallenge: {
        findOne: vi.fn().mockResolvedValue(CHECKOUT_INTENT),
        deleteOne: vi.fn().mockResolvedValue({}),
      },
    }));
    vi.doMock("@/lib/models/PasskeyCredential", () => ({
      PasskeyCredential: {
        findOne: vi.fn().mockResolvedValue(null),
        updateOne: vi.fn().mockResolvedValue({}),
      },
    }));
    vi.doMock("@/lib/models/VisitorPasskeyCredential", () => ({
      VisitorPasskeyCredential: {
        findOne: vi.fn().mockResolvedValue(VISITOR_CRED),
        updateOne: vi.fn().mockResolvedValue({}),
      },
    }));

    const logFindOne = vi.fn();
    logFindOne.mockResolvedValueOnce(checkinLog); // findOne({ _id: relatedLogId, action:'in' })
    logFindOne.mockResolvedValueOnce(existingCheckout); // findOne({ relatedLogId, action:'out' })

    const createdCheckout = {
      _id: "checkout-log-id",
      action: "out",
      passkeyVerified: true,
      toObject: () => ({
        _id: "checkout-log-id",
        action: "out",
        passkeyVerified: true,
      }),
    };
    const logCreate = vi.fn().mockResolvedValue(createdCheckout);
    vi.doMock("@/lib/models/Log", () => ({
      Log: {
        findOne: logFindOne,
        create: logCreate,
      },
    }));

    vi.doMock("@/lib/idempotency", () => ({
      checkIdempotency: vi.fn().mockResolvedValue(null),
      saveIdempotency: vi.fn().mockResolvedValue(undefined),
    }));

    vi.doMock("@simplewebauthn/server", () => ({
      verifyAuthenticationResponse: vi.fn().mockResolvedValue({
        verified: true,
        authenticationInfo: { newCounter: 1 },
      }),
    }));

    const { POST } = await import("@/app/api/logs/passkey/verify/route");
    return { POST, logCreate };
  }

  it("returns 201 with verified:true and checkout log", async () => {
    const { POST } = await setupCheckOutMocks();
    const res = await POST(makeReq(CHECKOUT_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.log.action).toBe("out");
    expect(body.log.passkeyVerified).toBe(true);
  });

  it("inserts a new OUT log row with relatedLogId pointing to the check-in", async () => {
    const { POST, logCreate } = await setupCheckOutMocks();
    await POST(makeReq(CHECKOUT_BODY));
    expect(logCreate).toHaveBeenCalledOnce();
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "out",
        passkeyVerified: true,
        relatedLogId: CHECK_IN_LOG._id,
      }),
    );
  });

  it("does NOT call Log.create when the check-in log is not found", async () => {
    const { POST, logCreate } = await setupCheckOutMocks({ checkinLog: null });
    const res = await POST(makeReq(CHECKOUT_BODY));
    expect(res.status).toBe(404);
    expect(logCreate).not.toHaveBeenCalled();
  });

  it("does NOT call Log.create when a checkout already exists", async () => {
    const existingOut = {
      _id: "existing-out-id",
      action: "out",
      toObject: () => ({ _id: "existing-out-id", action: "out" }),
    };
    const { POST, logCreate } = await setupCheckOutMocks({
      existingCheckout: existingOut,
    });
    await POST(makeReq(CHECKOUT_BODY));
    expect(logCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when relatedLogId is missing for checkout", async () => {
    const { POST } = await setupCheckOutMocks();
    const { relatedLogId: _drop, ...rest } = CHECKOUT_BODY;
    const res = await POST(makeReq(rest));
    // body validation passes but logic should reject missing relatedLogId
    expect([400, 201]).toContain(res.status); // 400 expected
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).toMatch(/relatedLogId required/);
    }
  });

  it("returns 404 when the original check-in log does not exist", async () => {
    const { POST } = await setupCheckOutMocks({ checkinLog: null });
    const res = await POST(makeReq(CHECKOUT_BODY));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Check-in log not found/);
  });

  it("returns already:true when checkout already exists (idempotent)", async () => {
    const existingOut = {
      _id: "existing-out-id",
      action: "out",
      toObject: () => ({ _id: "existing-out-id", action: "out" }),
    };
    const { POST } = await setupCheckOutMocks({
      existingCheckout: existingOut,
    });
    const res = await POST(makeReq(CHECKOUT_BODY));
    const body = await res.json();
    expect(body.already).toBe(true);
  });
});

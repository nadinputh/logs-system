import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEAM_ID = "507f1f77bcf86cd799439011";
const ACTOR_USER_ID = "507f1f77bcf86cd799439012";
const CHECKIN_LOG_ID = "507f1f77bcf86cd799439013";
const CHECKOUT_LOG_ID = "507f1f77bcf86cd799439014";

function makeReq(body: unknown) {
  return new NextRequest(
    `http://localhost/api/logs/${CHECKIN_LOG_ID}/manual-checkout`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "vitest" },
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/logs/[id]/manual-checkout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupMocks(options?: {
    authError?: unknown;
    checkinLog?: unknown;
    existingCheckout?: unknown;
  }) {
    const requireTeamPermission = vi.fn().mockResolvedValue({
      error: options?.authError ?? null,
      teamId: TEAM_ID,
      session: { user: { id: ACTOR_USER_ID } },
    });
    const connectDB = vi.fn().mockResolvedValue(undefined);

    const hasCheckinLogOverride =
      !!options && Object.prototype.hasOwnProperty.call(options, "checkinLog");
    const checkinLog = hasCheckinLogOverride
      ? options?.checkinLog
      : {
          _id: CHECKIN_LOG_ID,
          teamId: TEAM_ID,
          locationId: "507f1f77bcf86cd799439020",
          locationType: "room",
          sessionToken: "550e8400-e29b-41d4-a716-446655440000",
          visitorName: "Alice Visitor",
          visitorEmail: "alice@example.com",
          deviceId: "device-123",
        };

    const logFindOne = vi.fn().mockImplementation((query?: any) => {
      if (query?._id === CHECKIN_LOG_ID && query?.action === "in") {
        return Promise.resolve(checkinLog);
      }
      if (query?.relatedLogId === CHECKIN_LOG_ID && query?.action === "out") {
        return Promise.resolve(options?.existingCheckout ?? null);
      }
      return Promise.resolve(null);
    });

    const checkoutLog = {
      _id: CHECKOUT_LOG_ID,
      action: "out",
      relatedLogId: CHECKIN_LOG_ID,
    };
    const logCreate = vi.fn().mockResolvedValue(checkoutLog);
    const auditCreate = vi.fn().mockResolvedValue({ _id: "audit-id" });
    const publishLogCreated = vi.fn();

    vi.doMock("@/lib/middleware/auth", () => ({ requireTeamPermission }));
    vi.doMock("@/lib/db", () => ({ connectDB }));
    vi.doMock("@/lib/models/Log", () => ({
      Log: {
        findOne: logFindOne,
        create: logCreate,
      },
    }));
    vi.doMock("@/lib/models/AuditLog", () => ({
      AuditLog: { create: auditCreate },
    }));
    vi.doMock("@/lib/realtime/logEvents", () => ({ publishLogCreated }));

    const { POST } = await import("@/app/api/logs/[id]/manual-checkout/route");

    return {
      POST,
      requireTeamPermission,
      connectDB,
      logFindOne,
      logCreate,
      auditCreate,
      publishLogCreated,
    };
  }

  it("requires the manual checkout permission", async () => {
    const authResponse = {
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    };
    const { POST, requireTeamPermission, connectDB } = await setupMocks({
      authError: authResponse,
    });

    const res = await POST(
      makeReq({ reasonForChange: "Visitor lost passkey context" }),
      {
        params: Promise.resolve({ id: CHECKIN_LOG_ID }),
      },
    );

    expect(requireTeamPermission).toHaveBeenCalledWith("logs.manualCheckout");
    expect(connectDB).not.toHaveBeenCalled();
    expect(res).toBe(authResponse);
  });

  it("creates an append-only checkout log and audit entry", async () => {
    const { POST, logCreate, auditCreate, publishLogCreated } =
      await setupMocks();

    const res = await POST(
      makeReq({ reasonForChange: "Visitor passkey cannot be matched" }),
      {
        params: Promise.resolve({ id: CHECKIN_LOG_ID }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.log._id).toBe(CHECKOUT_LOG_ID);
    expect(logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "out",
        relatedLogId: CHECKIN_LOG_ID,
        visitorName: "Alice Visitor",
        visitorEmail: "alice@example.com",
      }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: TEAM_ID,
        logId: CHECKIN_LOG_ID,
        modifiedByUserId: ACTOR_USER_ID,
        field: "manualCheckout",
        originalValue: "open",
        newValue: CHECKOUT_LOG_ID,
        reasonForChange: "Visitor passkey cannot be matched",
      }),
    );
    expect(publishLogCreated).toHaveBeenCalledWith(
      expect.objectContaining({ _id: CHECKOUT_LOG_ID }),
    );
  });

  it("returns already:true when the log was already checked out", async () => {
    const existingCheckout = { _id: "existing-checkout-id", action: "out" };
    const { POST, logCreate, auditCreate, publishLogCreated } =
      await setupMocks({
        existingCheckout,
      });

    const res = await POST(
      makeReq({ reasonForChange: "Duplicate staff click" }),
      {
        params: Promise.resolve({ id: CHECKIN_LOG_ID }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.already).toBe(true);
    expect(logCreate).not.toHaveBeenCalled();
    expect(auditCreate).not.toHaveBeenCalled();
    expect(publishLogCreated).not.toHaveBeenCalled();
  });

  it("returns 404 when the check-in log does not exist", async () => {
    const { POST, logCreate } = await setupMocks({ checkinLog: null });

    const res = await POST(
      makeReq({ reasonForChange: "Cannot verify passkey" }),
      {
        params: Promise.resolve({ id: CHECKIN_LOG_ID }),
      },
    );

    expect(res.status).toBe(404);
    expect(logCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when the reason is missing", async () => {
    const { POST, connectDB } = await setupMocks();

    const res = await POST(makeReq({ reasonForChange: "" }), {
      params: Promise.resolve({ id: CHECKIN_LOG_ID }),
    });

    expect(res.status).toBe(400);
    expect(connectDB).not.toHaveBeenCalled();
  });
});

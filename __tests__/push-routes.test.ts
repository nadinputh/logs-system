import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEAM_ID = "507f1f77bcf86cd799439011";
const CALLER_USER_ID = "507f1f77bcf86cd799439012";
const OTHER_USER_ID = "507f1f77bcf86cd799439099";

function makeReq(url: string, body: unknown) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body),
  });
}

function subscribeReq(method: "POST" | "DELETE", body: unknown) {
  return new NextRequest("http://localhost/api/push/subscribe", {
    method,
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body),
  });
}

describe("POST/DELETE /api/push/subscribe", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupSubscribeMocks(options?: {
    session?: unknown;
    findOneAndUpdate?: ReturnType<typeof vi.fn>;
    deleteOne?: ReturnType<typeof vi.fn>;
  }) {
    const hasSessionOverride = !!options && Object.prototype.hasOwnProperty.call(options, "session");
    const session = hasSessionOverride ? options?.session : { user: { id: CALLER_USER_ID } };
    const findOneAndUpdate = options?.findOneAndUpdate ?? vi.fn().mockResolvedValue({ _id: "sub-1" });
    const deleteOne = options?.deleteOne ?? vi.fn().mockResolvedValue({ deletedCount: 1 });

    vi.doMock("next-auth", () => ({ getServerSession: vi.fn().mockResolvedValue(session) }));
    vi.doMock("@/lib/auth", () => ({ authOptions: {} }));
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/models/PushSubscription", () => ({
      PushSubscription: { findOneAndUpdate, deleteOne },
    }));

    const { POST, DELETE } = await import("@/app/api/push/subscribe/route");
    return { POST, DELETE, findOneAndUpdate, deleteOne };
  }

  it("POST upserts a subscription scoped to the caller's userId", async () => {
    const { POST, findOneAndUpdate } = await setupSubscribeMocks();

    const res = await POST(
      subscribeReq("POST", {
        endpoint: "https://push.example/ep-1",
        keys: { p256dh: "p1", auth: "a1" },
      }),
    );

    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { endpoint: "https://push.example/ep-1" },
      { userId: CALLER_USER_ID, endpoint: "https://push.example/ep-1", p256dh: "p1", auth: "a1" },
      { upsert: true },
    );
  });

  it("POST rejects a malformed subscription payload", async () => {
    const { POST, findOneAndUpdate } = await setupSubscribeMocks();

    const res = await POST(subscribeReq("POST", { endpoint: "not-a-url", keys: {} }));

    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("POST 401s with no session", async () => {
    const { POST, findOneAndUpdate } = await setupSubscribeMocks({ session: null });

    const res = await POST(
      subscribeReq("POST", { endpoint: "https://push.example/ep-1", keys: { p256dh: "p1", auth: "a1" } }),
    );

    expect(res.status).toBe(401);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("DELETE scopes the delete to the caller's own userId, not just the endpoint", async () => {
    const { DELETE, deleteOne } = await setupSubscribeMocks();

    const res = await DELETE(subscribeReq("DELETE", { endpoint: "https://push.example/ep-1" }));

    expect(res.status).toBe(200);
    expect(deleteOne).toHaveBeenCalledWith({
      endpoint: "https://push.example/ep-1",
      userId: CALLER_USER_ID,
    });
  });

  it("DELETE 401s with no session", async () => {
    const { DELETE, deleteOne } = await setupSubscribeMocks({ session: null });

    const res = await DELETE(subscribeReq("DELETE", { endpoint: "https://push.example/ep-1" }));

    expect(res.status).toBe(401);
    expect(deleteOne).not.toHaveBeenCalled();
  });

  it("DELETE requires an endpoint in the body", async () => {
    const { DELETE, deleteOne } = await setupSubscribeMocks();

    const res = await DELETE(subscribeReq("DELETE", {}));

    expect(res.status).toBe(400);
    expect(deleteOne).not.toHaveBeenCalled();
  });
});

describe("POST /api/push/send", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupMocks(options?: {
    targetMembership?: unknown;
    subscriptions?: unknown[];
    sendResults?: Array<"ok" | { statusCode: number; endpoint: string }>;
  }) {
    const requireTeamPermission = vi.fn().mockResolvedValue({
      error: null,
      teamId: TEAM_ID,
      session: { user: { id: CALLER_USER_ID } },
    });

    const hasMembershipOverride =
      !!options && Object.prototype.hasOwnProperty.call(options, "targetMembership");
    const targetMembership = hasMembershipOverride
      ? options?.targetMembership
      : { _id: "membership-1", teamId: TEAM_ID, userId: OTHER_USER_ID, status: "active" };

    const teamMemberFindOne = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(targetMembership),
    });

    const subscriptions = options?.subscriptions ?? [
      { endpoint: "https://push.example/alive", p256dh: "p1", auth: "a1" },
    ];
    const deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
    const pushSubFind = vi.fn().mockReturnValue({
      lean: vi.fn().mockResolvedValue(subscriptions),
    });

    const sendResults = options?.sendResults ?? subscriptions.map(() => "ok" as const);
    let call = 0;
    const sendNotification = vi.fn().mockImplementation(() => {
      const outcome = sendResults[call++];
      if (outcome === "ok") return Promise.resolve({ statusCode: 201 });
      const err: any = new Error("gone");
      err.statusCode = outcome.statusCode;
      err.endpoint = outcome.endpoint;
      return Promise.reject(err);
    });
    const webpushMock = { setVapidDetails: vi.fn(), sendNotification };

    vi.doMock("@/lib/middleware/auth", () => ({ requireTeamPermission }));
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/models/TeamMember", () => ({
      TeamMember: { findOne: teamMemberFindOne },
    }));
    vi.doMock("@/lib/models/PushSubscription", () => ({
      PushSubscription: { find: pushSubFind, deleteMany },
    }));
    vi.doMock("web-push", () => ({ default: webpushMock, ...webpushMock }));

    const { POST } = await import("@/app/api/push/send/route");

    return { POST, requireTeamPermission, teamMemberFindOne, pushSubFind, deleteMany, sendNotification };
  }

  it("403s when the target userId is not a member of the admin's team", async () => {
    const { POST, teamMemberFindOne, pushSubFind } = await setupMocks({
      targetMembership: null,
    });

    const res = await POST(
      makeReq("http://localhost/api/push/send", {
        userId: OTHER_USER_ID,
        title: "Hi",
        message: "test",
      }),
    );

    expect(res.status).toBe(403);
    expect(teamMemberFindOne).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      userId: OTHER_USER_ID,
      status: "active",
    });
    expect(pushSubFind).not.toHaveBeenCalled();
  });

  it("sends to a userId that is a member of the caller's team", async () => {
    const { POST, sendNotification } = await setupMocks();

    const res = await POST(
      makeReq("http://localhost/api/push/send", {
        userId: OTHER_USER_ID,
        title: "Hi",
        message: "test",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ sent: 1, total: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
  });

  it("403s (passthrough) when the caller lacks team.members.manage", async () => {
    const authResponse = { status: 403, json: async () => ({ error: "Forbidden" }) };
    const requireTeamPermission = vi.fn().mockResolvedValue({
      error: authResponse,
      teamId: null,
      session: null,
    });
    vi.doMock("@/lib/middleware/auth", () => ({ requireTeamPermission }));
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }));
    vi.doMock("@/lib/models/TeamMember", () => ({ TeamMember: { findOne: vi.fn() } }));
    vi.doMock("@/lib/models/PushSubscription", () => ({ PushSubscription: { find: vi.fn(), deleteMany: vi.fn() } }));
    vi.doMock("web-push", () => ({ default: {}, setVapidDetails: vi.fn(), sendNotification: vi.fn() }));

    const { POST } = await import("@/app/api/push/send/route");
    const res = await POST(makeReq("http://localhost/api/push/send", { userId: OTHER_USER_ID, title: "Hi", message: "test" }));

    expect(res).toBe(authResponse);
  });

  it("400s when userId, title, or message is missing", async () => {
    const { POST, teamMemberFindOne } = await setupMocks();

    const res = await POST(makeReq("http://localhost/api/push/send", { userId: OTHER_USER_ID }));

    expect(res.status).toBe(400);
    expect(teamMemberFindOne).not.toHaveBeenCalled();
  });

  it("returns sent:0 when the target has no subscriptions, without calling webpush", async () => {
    const { POST, sendNotification } = await setupMocks({ subscriptions: [] });

    const res = await POST(
      makeReq("http://localhost/api/push/send", { userId: OTHER_USER_ID, title: "Hi", message: "test" }),
    );
    const body = await res.json();

    expect(body).toEqual({ sent: 0, reason: "no subscriptions" });
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("prunes a subscription the push service reports as gone (410)", async () => {
    const subscriptions = [
      { endpoint: "https://push.example/dead", p256dh: "p1", auth: "a1" },
    ];
    const { POST, deleteMany } = await setupMocks({
      subscriptions,
      sendResults: [{ statusCode: 410, endpoint: "https://push.example/dead" }],
    });

    const res = await POST(
      makeReq("http://localhost/api/push/send", {
        userId: OTHER_USER_ID,
        title: "Hi",
        message: "test",
      }),
    );
    const body = await res.json();

    expect(body).toEqual({ sent: 0, total: 1 });
    expect(deleteMany).toHaveBeenCalledWith({
      endpoint: { $in: ["https://push.example/dead"] },
    });
  });
});

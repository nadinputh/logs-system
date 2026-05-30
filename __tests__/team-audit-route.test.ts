import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEAM_ID = "507f1f77bcf86cd799439011";
const ACTOR_USER_ID = "507f1f77bcf86cd799439012";
const TARGET_USER_ID = "507f1f77bcf86cd799439013";

function makeReq(query = "") {
  const suffix = query ? `?${query}` : "";
  return new NextRequest(`http://localhost/api/teams/test/audit${suffix}`, {
    method: "GET",
  });
}

function makeChainResult(value: unknown) {
  const query: any = {
    sort: vi.fn(),
    limit: vi.fn(),
    lean: vi.fn(),
    select: vi.fn(),
  };

  query.sort.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  query.select.mockReturnValue(query);
  query.lean.mockResolvedValue(value);

  return query;
}

function requireResponse<T>(response: T | null): T {
  if (response === null) {
    throw new Error("Expected route to return a response");
  }
  return response;
}

describe("GET /api/teams/[id]/audit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupMocks(options?: {
    authError?: unknown;
    auditRows?: any[];
    users?: any[];
  }) {
    const requireTeamPermission = vi.fn().mockResolvedValue({
      error: options?.authError ?? null,
      teamId: TEAM_ID,
      session: { user: { id: ACTOR_USER_ID } },
      membership: { role: "admin" },
    });

    const connectDB = vi.fn().mockResolvedValue(undefined);

    const auditRows = options?.auditRows ?? [
      {
        _id: "507f1f77bcf86cd799439020",
        teamId: TEAM_ID,
        action: "member_role_changed",
        actorUserId: ACTOR_USER_ID,
        targetUserId: TARGET_USER_ID,
        metadata: { previousRole: "member", newRole: "manager" },
        createdAt: new Date("2026-05-30T10:00:00.000Z"),
      },
    ];

    const users = options?.users ?? [
      { _id: ACTOR_USER_ID, name: "Alice Admin", email: "alice@example.com" },
      { _id: TARGET_USER_ID, name: "Bob Member", email: "bob@example.com" },
    ];

    const teamAuditFind = vi.fn().mockReturnValue(makeChainResult(auditRows));
    const userFind = vi.fn().mockReturnValue(makeChainResult(users));

    vi.doMock("@/lib/middleware/auth", () => ({ requireTeamPermission }));
    vi.doMock("@/lib/db", () => ({ connectDB }));
    vi.doMock("@/lib/models/TeamAuditLog", () => ({
      TeamAuditLog: {
        find: teamAuditFind,
      },
    }));
    vi.doMock("@/lib/models/User", () => ({
      User: {
        find: userFind,
      },
    }));

    const { GET } = await import("@/app/api/teams/[id]/audit/route");

    return {
      GET,
      requireTeamPermission,
      connectDB,
      teamAuditFind,
      userFind,
    };
  }

  it("returns auth error when permission check fails", async () => {
    const authResponse = {
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    };
    const { GET, requireTeamPermission } = await setupMocks({
      authError: authResponse,
    });

    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: TEAM_ID }),
    });

    expect(requireTeamPermission).toHaveBeenCalledWith("team.audit.read", {
      teamId: TEAM_ID,
    });
    expect(res).toBe(authResponse);
  });

  it("returns 400 for invalid action filter", async () => {
    const { GET, connectDB, teamAuditFind } = await setupMocks();

    const res = requireResponse(
      await GET(makeReq("action=not-valid"), {
        params: Promise.resolve({ id: TEAM_ID }),
      }),
    );

    expect(res.status).toBe(400);
    expect(connectDB).not.toHaveBeenCalled();
    expect(teamAuditFind).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid from date filter", async () => {
    const { GET, teamAuditFind } = await setupMocks();

    const res = requireResponse(
      await GET(makeReq("from=not-a-date"), {
        params: Promise.resolve({ id: TEAM_ID }),
      }),
    );

    expect(res.status).toBe(400);
    expect(teamAuditFind).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid cursor", async () => {
    const { GET, teamAuditFind } = await setupMocks();

    const res = requireResponse(
      await GET(makeReq("cursor=bad-cursor-value"), {
        params: Promise.resolve({ id: TEAM_ID }),
      }),
    );

    expect(res.status).toBe(400);
    expect(teamAuditFind).not.toHaveBeenCalled();
  });

  it("filters query using from/to range", async () => {
    const { GET, teamAuditFind } = await setupMocks();

    const res = requireResponse(
      await GET(makeReq("from=2026-05-01&to=2026-05-31"), {
        params: Promise.resolve({ id: TEAM_ID }),
      }),
    );

    expect(res.status).toBe(200);
    expect(teamAuditFind).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      createdAt: {
        $gte: new Date("2026-05-01T00:00:00.000Z"),
        $lte: new Date("2026-05-31T23:59:59.999Z"),
      },
    });
  });

  it("returns mapped events with actor/target user data", async () => {
    const { GET, teamAuditFind, userFind } = await setupMocks();

    const res = requireResponse(
      await GET(makeReq("limit=10&action=member_role_changed"), {
        params: Promise.resolve({ id: TEAM_ID }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(teamAuditFind).toHaveBeenCalledWith({
      teamId: TEAM_ID,
      action: "member_role_changed",
    });
    expect(userFind).toHaveBeenCalled();

    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toEqual(
      expect.objectContaining({
        action: "member_role_changed",
        actor: {
          id: ACTOR_USER_ID,
          name: "Alice Admin",
          email: "alice@example.com",
        },
        target: {
          id: TARGET_USER_ID,
          name: "Bob Member",
          email: "bob@example.com",
        },
      }),
    );
  });

  it("returns nextCursor and hasMore when results exceed limit", async () => {
    const { GET } = await setupMocks({
      auditRows: [
        {
          _id: "507f1f77bcf86cd799439020",
          teamId: TEAM_ID,
          action: "member_role_changed",
          actorUserId: ACTOR_USER_ID,
          targetUserId: TARGET_USER_ID,
          metadata: { previousRole: "member", newRole: "manager" },
          createdAt: new Date("2026-05-30T10:00:00.000Z"),
        },
        {
          _id: "507f1f77bcf86cd799439021",
          teamId: TEAM_ID,
          action: "member_status_changed",
          actorUserId: ACTOR_USER_ID,
          targetUserId: TARGET_USER_ID,
          metadata: { previousStatus: "active", newStatus: "suspended" },
          createdAt: new Date("2026-05-30T09:00:00.000Z"),
        },
      ],
    });

    const res = requireResponse(
      await GET(makeReq("limit=1"), {
        params: Promise.resolve({ id: TEAM_ID }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.hasMore).toBe(true);
    expect(typeof body.nextCursor).toBe("string");
    expect(body.nextCursor).toContain(":");
  });

  it("applies cursor to fetch older audit events", async () => {
    const { GET, teamAuditFind } = await setupMocks();
    const cursorDate = new Date("2026-05-30T10:00:00.000Z");
    const cursorId = "507f1f77bcf86cd799439099";
    const cursor = `${cursorDate.getTime()}:${cursorId}`;

    const res = requireResponse(
      await GET(makeReq(`cursor=${cursor}`), {
        params: Promise.resolve({ id: TEAM_ID }),
      }),
    );

    expect(res.status).toBe(200);

    const queryArg = teamAuditFind.mock.calls[0][0];
    expect(queryArg.teamId).toBe(TEAM_ID);
    expect(Array.isArray(queryArg.$or)).toBe(true);
    expect(queryArg.$or[0]).toEqual({
      createdAt: { $lt: cursorDate },
    });
    expect(queryArg.$or[1].createdAt).toEqual(cursorDate);
    expect(String(queryArg.$or[1]._id.$lt)).toBe(cursorId);
  });

  it("returns CSV export when format=csv", async () => {
    const { GET } = await setupMocks();

    const res = requireResponse(
      await GET(makeReq("format=csv&action=member_role_changed&limit=10"), {
        params: Promise.resolve({ id: TEAM_ID }),
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");

    const csv = await res.text();
    expect(csv).toContain(
      "createdAt,action,actorName,actorEmail,actorId,targetName,targetEmail,targetId,metadata",
    );
    expect(csv).toContain("member_role_changed");
    expect(csv).toContain("Alice Admin");
    expect(csv).toContain("Bob Member");
  });
});

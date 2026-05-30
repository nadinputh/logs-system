import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEAM_ID = "507f1f77bcf86cd799439011";
const ACTOR_USER_ID = "507f1f77bcf86cd799439012";
const TARGET_USER_ID = "507f1f77bcf86cd799439013";

function makeReq(body: unknown) {
  return new NextRequest("http://localhost/api/teams/test/ownership", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeQueryResult(value: unknown) {
  const query: any = {
    select: vi.fn(),
    lean: vi.fn(),
  };

  query.select.mockReturnValue(query);
  query.lean.mockResolvedValue(value);
  return query;
}

describe("POST /api/teams/[id]/ownership", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  async function setupMocks(options?: {
    authError?: unknown;
    actorMembership?: unknown;
    targetMembership?: unknown;
    teamRecord?: unknown;
  }) {
    const hasTeamRecordOverride =
      !!options && Object.prototype.hasOwnProperty.call(options, "teamRecord");

    const requireTeamPermission = vi.fn().mockResolvedValue({
      error: options?.authError ?? null,
      teamId: TEAM_ID,
      session: {
        user: {
          id: ACTOR_USER_ID,
        },
      },
      membership: { role: "owner" },
    });

    const connectDB = vi.fn().mockResolvedValue(undefined);

    const teamFindOne = vi.fn().mockReturnValue(
      makeQueryResult(
        hasTeamRecordOverride
          ? options?.teamRecord
          : {
              _id: TEAM_ID,
              ownerUserId: ACTOR_USER_ID,
            },
      ),
    );
    const teamUpdateOne = vi.fn().mockResolvedValue({ acknowledged: true });

    const actorMembership = options?.actorMembership ?? {
      _id: "actor-member-id",
      role: "owner",
    };
    const targetMembership = options?.targetMembership ?? {
      _id: "target-member-id",
      role: "admin",
    };

    const teamMemberFindOne = vi
      .fn()
      .mockReturnValueOnce(makeQueryResult(actorMembership))
      .mockReturnValueOnce(makeQueryResult(targetMembership));

    const teamMemberUpdateOne = vi
      .fn()
      .mockResolvedValue({ acknowledged: true });
    const userUpdateOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const recordTeamAuditEvent = vi.fn().mockResolvedValue(undefined);

    vi.doMock("@/lib/middleware/auth", () => ({ requireTeamPermission }));
    vi.doMock("@/lib/db", () => ({ connectDB }));
    vi.doMock("@/lib/models/Team", () => ({
      Team: {
        findOne: teamFindOne,
        updateOne: teamUpdateOne,
      },
    }));
    vi.doMock("@/lib/models/TeamMember", () => ({
      TeamMember: {
        findOne: teamMemberFindOne,
        updateOne: teamMemberUpdateOne,
      },
    }));
    vi.doMock("@/lib/models/User", () => ({
      User: {
        updateOne: userUpdateOne,
      },
    }));
    vi.doMock("@/lib/teamAudit", () => ({ recordTeamAuditEvent }));

    const { POST } = await import("@/app/api/teams/[id]/ownership/route");

    return {
      POST,
      requireTeamPermission,
      connectDB,
      teamFindOne,
      teamUpdateOne,
      teamMemberFindOne,
      teamMemberUpdateOne,
      userUpdateOne,
      recordTeamAuditEvent,
    };
  }

  it("returns auth error when permission check fails", async () => {
    const authResponse = {
      status: 403,
      json: async () => ({ error: "Forbidden" }),
    };
    const { POST, requireTeamPermission } = await setupMocks({
      authError: authResponse,
    });

    const res = await POST(makeReq({ targetUserId: TARGET_USER_ID }), {
      params: Promise.resolve({ id: TEAM_ID }),
    });

    expect(requireTeamPermission).toHaveBeenCalledWith(
      "team.ownership.transfer",
      {
        teamId: TEAM_ID,
      },
    );
    expect(res).toBe(authResponse);
  });

  it("returns 400 for invalid target user id", async () => {
    const { POST, connectDB } = await setupMocks();

    const res = await POST(makeReq({ targetUserId: "bad-id" }), {
      params: Promise.resolve({ id: TEAM_ID }),
    });

    expect(res.status).toBe(400);
    expect(connectDB).not.toHaveBeenCalled();
  });

  it("returns 403 when actor is not current owner in team record", async () => {
    const { POST } = await setupMocks({ teamRecord: null });

    const res = await POST(makeReq({ targetUserId: TARGET_USER_ID }), {
      params: Promise.resolve({ id: TEAM_ID }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/current owner/i);
  });

  it("transfers ownership and demotes prior owner on success", async () => {
    const {
      POST,
      teamUpdateOne,
      teamMemberUpdateOne,
      userUpdateOne,
      teamMemberFindOne,
      recordTeamAuditEvent,
    } = await setupMocks();

    const res = await POST(
      makeReq({
        targetUserId: TARGET_USER_ID,
        demoteCurrentOwnerRole: "admin",
      }),
      { params: Promise.resolve({ id: TEAM_ID }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.newOwnerUserId).toBe(TARGET_USER_ID);

    expect(teamMemberFindOne).toHaveBeenCalledTimes(2);
    expect(teamUpdateOne).toHaveBeenCalledWith(
      { _id: TEAM_ID },
      { ownerUserId: TARGET_USER_ID },
    );
    expect(teamMemberUpdateOne).toHaveBeenCalledWith(
      { teamId: TEAM_ID, userId: ACTOR_USER_ID },
      { role: "admin", status: "active" },
    );
    expect(teamMemberUpdateOne).toHaveBeenCalledWith(
      { teamId: TEAM_ID, userId: TARGET_USER_ID },
      { role: "owner", status: "active" },
    );
    expect(userUpdateOne).toHaveBeenCalled();
    expect(recordTeamAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: TEAM_ID,
        actorUserId: ACTOR_USER_ID,
        targetUserId: TARGET_USER_ID,
        action: "ownership_transferred",
      }),
    );
  });
});

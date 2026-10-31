import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const hdr = { "content-type": "application/json" };
const ID = "aaaaaaaaaaaaaaaaaaaaaaa2";

beforeEach(() => vi.resetModules());

describe("operator injection is rejected before any query", () => {
  it("PATCH /api/logs/[id] refuses an object sessionToken", async () => {
    const findOne = vi.fn();
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
    vi.doMock("@/lib/models/Log", () => ({ Log: { findOne } }));
    const { PATCH } = await import("@/app/api/logs/[id]/route");
    const res = await PATCH(
      new NextRequest(`http://localhost/api/logs/${ID}`, {
        method: "PATCH",
        headers: hdr,
        body: JSON.stringify({ sessionToken: { $ne: null } }),
      }),
      { params: Promise.resolve({ id: ID }) },
    );
    expect(res.status).toBe(400);
    expect(findOne).not.toHaveBeenCalled();
  });

  it("POST /api/push/send refuses an object userId (would fan out to every subscriber)", async () => {
    const find = vi.fn();
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
    vi.doMock("@/lib/models/PushSubscription", () => ({ PushSubscription: { find } }));
    vi.doMock("@/lib/models/TeamMember", () => ({ TeamMember: { findOne: vi.fn() } }));
    vi.doMock("@/lib/middleware/auth", () => ({
      requireTeamPermission: async () => ({ error: null, teamId: "t", session: {} }),
    }));
    const { POST } = await import("@/app/api/push/send/route");
    const res = await POST(
      new NextRequest("http://localhost/api/push/send", {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ userId: { $ne: null }, title: "t", message: "m" }),
      }),
    );
    expect(res.status).toBe(400);
    expect(find).not.toHaveBeenCalled();
  });

  it("POST /api/push/send refuses an off-site click url", async () => {
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
    vi.doMock("@/lib/models/PushSubscription", () => ({ PushSubscription: { find: vi.fn() } }));
    vi.doMock("@/lib/models/TeamMember", () => ({ TeamMember: { findOne: vi.fn() } }));
    vi.doMock("@/lib/middleware/auth", () => ({
      requireTeamPermission: async () => ({ error: null, teamId: "t", session: {} }),
    }));
    const { POST } = await import("@/app/api/push/send/route");
    const res = await POST(
      new NextRequest("http://localhost/api/push/send", {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ userId: ID, title: "t", message: "m", url: "https://evil.example" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("password blocklist", () => {
  it("rejects trivially guessable passwords and accepts a normal one", async () => {
    const { PasswordSchema } = await import("@/lib/validations/password");
    for (const bad of ["password", "Password123", "11111111", "aaaabbbb"]) {
      expect(PasswordSchema.safeParse(bad).success).toBe(false);
    }
    expect(PasswordSchema.safeParse("correct-horse").success).toBe(true);
  });
});

describe("invite creation", () => {
  it("never returns the plaintext token, even when the mail was delivered", async () => {
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
    vi.doMock("@/lib/middleware/auth", () => ({
      requireTeamPermission: async () => ({
        error: null,
        teamId: "t",
        membership: { role: "owner" },
        session: { user: { id: "u", name: "Owner" } },
      }),
    }));
    vi.doMock("@/lib/models/User", () => ({ User: { findOne: () => ({ select: () => ({ lean: async () => null }) }) } }));
    vi.doMock("@/lib/models/TeamMember", () => ({ TeamMember: { findOne: vi.fn() } }));
    vi.doMock("@/lib/models/Team", () => ({ Team: { findById: () => ({ select: () => ({ lean: async () => ({ name: "T" }) }) }) } }));
    vi.doMock("@/lib/models/TeamInvite", () => ({
      TeamInvite: {
        findOneAndUpdate: () => ({
          lean: async () => ({ _id: { toString: () => "i1" }, email: "v@x.test", role: "member", status: "pending", expiresAt: new Date() }),
        }),
      },
    }));
    vi.doMock("@/lib/email/send", () => ({ sendInviteEmail: async () => true }));
    const { POST } = await import("@/app/api/teams/[id]/invites/route");
    const res = await POST(
      new NextRequest("http://localhost/api/teams/t/invites", {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ email: "v@x.test", role: "member" }),
      }),
      { params: Promise.resolve({ id: "t" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(201);
    expect(body.invite).not.toHaveProperty("token");
    expect(body.inviteUrl).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/invite\/[0-9a-f-]{36}/);
  });
});

describe("quest progress POST", () => {
  it("echoes step progress only, never the first holder's sessionToken or userId", async () => {
    const HOLDER = "11111111-1111-4111-8111-111111111111";
    const LOC = "507f1f77bcf86cd799439011";
    const progress: any = {
      teamId: "t",
      sessionToken: HOLDER,
      userId: "u-holder",
      completedSteps: [{ locationId: { toString: () => LOC }, stepOrder: 0 }],
      completedAt: undefined,
    };
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
    vi.doMock("next-auth", () => ({ getServerSession: async () => null }));
    vi.doMock("@/lib/auth", () => ({ authOptions: {} }));
    vi.doMock("@/lib/rateLimitShared", () => ({ rateLimitShared: async () => ({ ok: true }) }));
    vi.doMock("@/lib/rateLimit", () => ({ clientKey: () => "k" }));
    vi.doMock("@/lib/models/QuestCard", () => ({
      QuestCard: { findOne: async () => ({ _id: "c", teamId: { toString: () => "t" }, type: "custom", steps: [{ order: 0 }] }) },
    }));
    vi.doMock("@/lib/models/QuestProgress", () => ({ QuestProgress: { findOne: async () => progress } }));
    vi.doMock("@/lib/locationOwnership", () => ({
      findOwnedLocationByType: async () => ({ teamId: { toString: () => "t" } }),
    }));
    vi.doMock("@/lib/kioskGate", () => ({ kioskGate: async () => null }));
    const { POST } = await import("@/app/api/quests/[token]/progress/route");
    const res = await POST(
      new NextRequest("http://localhost/api/quests/tok/progress", {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({
          locationId: LOC,
          locationType: "room",
          sessionToken: "22222222-2222-4222-8222-222222222222",
        }),
      }),
      { params: Promise.resolve({ token: "tok" }) },
    );
    const text = JSON.stringify(await res.json());
    expect(res.status).toBe(200);
    expect(text).not.toContain(HOLDER);
    expect(text).not.toContain("u-holder");
  });
});

describe("register on an already-verified address", () => {
  it("answers exactly like a fresh sign-up (no EMAIL_IN_USE oracle)", async () => {
    vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
    vi.doMock("@/lib/csrf", () => ({ assertSameOrigin: () => null }));
    vi.doMock("@/lib/rateLimitShared", () => ({ rateLimitShared: async () => ({ ok: true }) }));
    vi.doMock("@/lib/rateLimit", () => ({ clientKey: () => "k" }));
    vi.doMock("@/lib/models/User", () => ({
      User: { findOne: async () => ({ _id: "u", emailVerified: new Date(), passwordHash: "h" }) },
    }));
    vi.doMock("@/lib/models/Team", () => ({ Team: {} }));
    vi.doMock("@/lib/models/TeamMember", () => ({ TeamMember: {} }));
    vi.doMock("@/lib/verification", () => ({
      issueVerificationToken: async () => ({ token: "t", expiresAt: new Date() }),
      reissueAsSetPassword: vi.fn(),
      discardIfUndelivered: async () => {},
      resetPasswordLink: (t: string) => t,
      setPasswordLink: (t: string) => t,
    }));
    vi.doMock("@/lib/email/send", () => ({
      sendPasswordResetEmail: async () => true,
      sendSetPasswordEmail: async () => true,
      smtpConfigured: () => true,
    }));
    const { POST } = await import("@/app/api/auth/register/route");
    const res = await POST(
      new NextRequest("http://localhost/api/auth/register", {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ name: "N", email: "taken@acme.test", teamName: "T" }),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).code).toBeUndefined();
  });
});

describe("mailed bearer links", () => {
  it("are never handed back to the requester in production, only in dev/test", async () => {
    const { linkIfUndelivered } = await import("@/lib/server/exposeLink");
    const prev = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = "production";
      expect(linkIfUndelivered(false, "https://x/invite/abc")).toBeUndefined();
      expect(linkIfUndelivered(true, "https://x/invite/abc")).toBeUndefined();
      (process.env as any).NODE_ENV = "development";
      expect(linkIfUndelivered(false, "https://x/invite/abc")).toBe("https://x/invite/abc");
      expect(linkIfUndelivered(true, "https://x/invite/abc")).toBeUndefined();
    } finally {
      (process.env as any).NODE_ENV = prev;
    }
  });
});

describe("guest input bounds (append-only ledger)", () => {
  it("rejects a multi-megabyte visitorEmail on every unauthenticated schema", async () => {
    const huge = "a".repeat(5_000_000) + "@acme.test";
    const { CreateLogSchema } = await import("@/lib/validations/log");
    const base = {
      locationId: "507f1f77bcf86cd799439011",
      locationType: "room",
      sessionToken: "550e8400-e29b-41d4-a716-446655440000",
    };
    expect(CreateLogSchema.safeParse({ ...base, visitorEmail: huge }).success).toBe(false);
    expect(CreateLogSchema.safeParse({ ...base, visitorEmail: "ok@acme.test" }).success).toBe(true);
  });
});

describe("WebAuthn registration input bounds", () => {
  it("drops unknown transports and refuses oversized response fields", async () => {
    const { safeTransports, RegistrationResponseSchema } = await import("@/lib/validations/webauthn");
    expect(safeTransports(["internal", "x".repeat(1_000_000), "usb", "internal", 5, null])).toEqual(["internal", "usb"]);
    expect(safeTransports("not-an-array")).toEqual([]);
    const ok = { id: "abc", response: { clientDataJSON: "e30", transports: ["internal"] } };
    expect(RegistrationResponseSchema.safeParse(ok).success).toBe(true);
    // A multi-megabyte transports array or field is rejected before it can be stored.
    expect(
      RegistrationResponseSchema.safeParse({ ...ok, response: { transports: Array(100_000).fill("usb") } }).success,
    ).toBe(false);
    expect(
      RegistrationResponseSchema.safeParse({ ...ok, response: { attestationObject: "A".repeat(5_000_000) } }).success,
    ).toBe(false);
    expect(RegistrationResponseSchema.safeParse({ id: "A".repeat(5000), response: {} }).success).toBe(false);
  });
});

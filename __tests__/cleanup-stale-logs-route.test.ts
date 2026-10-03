import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/cleanup-stale-logs", {
    headers: auth ? { authorization: auth } : {},
  });

const H = 3600_000;

async function setup(open: any[], createImpl?: (d: any) => any) {
  vi.resetModules();
  const create = vi.fn(createImpl ?? (async (d: any) => ({ ...d, _id: { toString: () => "out1" } })));
  const auditCreate = vi.fn().mockResolvedValue({});
  vi.doMock("@/lib/db", () => ({ connectDB: vi.fn() }));
  vi.doMock("@/lib/models/Log", () => ({
    Log: { aggregate: vi.fn().mockResolvedValue(open), create, collection: { name: "logs" } },
  }));
  vi.doMock("@/lib/models/AuditLog", () => ({ AuditLog: { create: auditCreate } }));
  vi.doMock("@/lib/realtime/logEvents", () => ({ publishLogCreated: vi.fn() }));
  const { GET } = await import("@/app/api/cron/cleanup-stale-logs/route");
  return { GET, create, auditCreate };
}

describe("cleanup-stale-logs cron", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cret";
  });

  it("rejects when CRON_SECRET is unset, even with no header", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await setup([]);
    expect((await GET(req())).status).toBe(401);
  });

  it("rejects a wrong secret", async () => {
    const { GET } = await setup([]);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
  });

  it("caps checkout at check-in + 12h and writes an audit entry", async () => {
    const t = new Date(Date.now() - 30 * H);
    const { GET, create, auditCreate } = await setup([
      { _id: "c1", teamId: "t1", locationId: "l1", locationType: "room", sessionToken: "s", timestamp: t },
    ]);
    const res = await GET(req("Bearer s3cret"));
    expect(await res.json()).toEqual({ cleaned: 1, skipped: 0 });
    expect(create.mock.calls[0][0].timestamp.getTime()).toBe(t.getTime() + 12 * H);
    expect(create.mock.calls[0][0].autoCheckedOut).toBe(true);
    expect(auditCreate.mock.calls[0][0]).toMatchObject({ field: "autoCheckout", logId: "c1" });
  });

  it("treats a duplicate-key race as skipped, not an error", async () => {
    const { GET, auditCreate } = await setup(
      [{ _id: "c1", teamId: "t1", timestamp: new Date(Date.now() - 20 * H) }],
      async () => {
        throw Object.assign(new Error("dup"), { code: 11000 });
      },
    );
    expect(await (await GET(req("Bearer s3cret"))).json()).toEqual({ cleaned: 0, skipped: 1 });
    expect(auditCreate).not.toHaveBeenCalled();
  });
});

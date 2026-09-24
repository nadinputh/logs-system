import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEAM_ID = "507f1f77bcf86cd799439011";

function makeReq() {
  return new NextRequest(`http://localhost/api/teams/${TEAM_ID}/billing`);
}

async function setupMocks(options?: { mockBillingEnabled?: boolean }) {
  const requireTeamPermission = vi.fn().mockResolvedValue({ error: null, teamId: TEAM_ID });
  const connectDB = vi.fn().mockResolvedValue(undefined);

  const planFindCall = vi.fn();
  const planFind = vi.fn().mockImplementation((filter: Record<string, unknown>) => {
    planFindCall(filter);
    return {
      select: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([{ _id: "p1", name: "Pro" }]) }),
      }),
    };
  });

  vi.doMock("@/lib/middleware/auth", () => ({ requireTeamPermission }));
  vi.doMock("@/lib/db", () => ({ connectDB }));
  vi.doMock("@/lib/models/Subscription", () => ({ Subscription: { findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }) } }));
  vi.doMock("@/lib/models/Plan", () => ({ Plan: { find: planFind, findById: vi.fn() } }));
  vi.doMock("@/lib/models/Invoice", () => ({ Invoice: { find: vi.fn() } }));
  vi.doMock("@/lib/models/TeamMember", () => ({ TeamMember: { countDocuments: vi.fn().mockResolvedValue(0) } }));
  vi.doMock("@/lib/models/Building", () => ({ Building: { countDocuments: vi.fn().mockResolvedValue(0) } }));
  vi.doMock("@/lib/billing/provider", () => ({
    isBillingConfigured: vi.fn().mockReturnValue(true),
    mockBillingEnabled: vi.fn().mockReturnValue(options?.mockBillingEnabled ?? false),
  }));

  const { GET } = await import("@/app/api/teams/[id]/billing/route");
  return { GET, planFindCall };
}

describe("GET /api/teams/[id]/billing — plan listing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires a synced stripePriceId when the dev-mode bypass is off", async () => {
    const { GET, planFindCall } = await setupMocks({ mockBillingEnabled: false });

    await GET(makeReq(), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(planFindCall).toHaveBeenCalledWith({
      isActive: true,
      stripePriceId: { $exists: true, $ne: null },
    });
  });

  it("lists plans with no stripePriceId when BILLING_MOCK_MODE is active", async () => {
    // Regression test: scripts/seed-plans.ts deliberately leaves stripePriceId
    // unset in dev, so the old unconditional filter hid every plan from the
    // billing card the moment mock mode was the only thing "configuring"
    // billing — self-serve checkout was unreachable from the UI.
    const { GET, planFindCall } = await setupMocks({ mockBillingEnabled: true });

    await GET(makeReq(), { params: Promise.resolve({ id: TEAM_ID }) });

    expect(planFindCall).toHaveBeenCalledWith({ isActive: true });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const buckets = new Map<string, number>();
vi.mock("@/lib/db", () => ({ connectDB: async () => {} }));
vi.mock("@/lib/models/RateBucket", () => ({
  RateBucket: {
    findOneAndUpdate: (f: { key: string }) => ({
      lean: async () => {
        buckets.set(f.key, (buckets.get(f.key) ?? 0) + 1);
        return { count: buckets.get(f.key) };
      },
    }),
  },
}));

describe("rateLimitShared", () => {
  beforeEach(() => buckets.clear());

  it("allows up to the limit then refuses with a retry hint", async () => {
    const { rateLimitShared } = await import("@/lib/rateLimitShared");
    expect((await rateLimitShared("ip", 2, 60_000)).ok).toBe(true);
    expect((await rateLimitShared("ip", 2, 60_000)).ok).toBe(true);
    const third = await rateLimitShared("ip", 2, 60_000);
    expect(third.ok).toBe(false);
    expect(!third.ok && third.retryAfter).toBeGreaterThan(0);
  });
});

describe('rateLimitRefund targets the window that was charged', () => {
  it('uses the supplied window, not the current clock', async () => {
    vi.resetModules()
    const updateOne = vi.fn()
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/RateBucket', () => ({ RateBucket: { updateOne } }))
    const { rateLimitRefund } = await import('@/lib/rateLimitShared')
    await rateLimitRefund('login:ip:1.2.3.4', 900_000, 42)
    expect(updateOne).toHaveBeenCalledWith(
      { key: 'login:ip:1.2.3.4:42', count: { $gt: 0 } },
      { $inc: { count: -1 } },
    )
  })
})

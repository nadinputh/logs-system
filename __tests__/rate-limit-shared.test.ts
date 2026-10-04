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

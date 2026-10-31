import { vi } from "vitest";

// limitByIp counts in MongoDB; unit tests have no database, so it would hang on
// connect. The limiter itself is covered by rate-limit-shared.test.ts.
vi.mock("@/lib/rateLimitGuard", () => ({
  limitByIp: async () => null,
  mailAllowed: async () => true,
  actorMailLimit: async () => null,
}));

import { afterEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { Types } from "mongoose";
import { Log } from "@/lib/models/Log";
import { AuditLog } from "@/lib/models/AuditLog";
import { assertSameOrigin } from "@/lib/csrf";
import { readSecret } from "@/lib/secrets";
import { verifyKioskToken, verifySessionQrToken } from "@/lib/jwt";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("append-only ledger", () => {
  it.each([
    ["updateOne", () => Log.updateOne({}, { $set: { visitorName: "x" } }).exec()],
    ["updateMany", () => Log.updateMany({}, { $set: { visitorName: "x" } }).exec()],
    ["findOneAndUpdate", () => Log.findOneAndUpdate({}, { visitorName: "x" }).exec()],
    ["findByIdAndUpdate", () => Log.findByIdAndUpdate(new Types.ObjectId(), { visitorName: "x" }).exec()],
    ["deleteOne", () => Log.deleteOne({}).exec()],
    ["deleteMany", () => Log.deleteMany({}).exec()],
    ["AuditLog.updateOne", () => AuditLog.updateOne({}, { reasonForChange: "x" }).exec()],
    ["AuditLog.deleteMany", () => AuditLog.deleteMany({}).exec()],
  ])("%s is refused", async (_name, run) => {
    await expect(run()).rejects.toThrow(/append-only/);
  });

  it("refuses to re-save an existing document", async () => {
    const doc = new Log({
      teamId: new Types.ObjectId(),
      locationId: new Types.ObjectId(),
      locationType: "room",
      sessionToken: "t",
      action: "in",
    });
    doc.isNew = false;
    await expect(doc.save()).rejects.toThrow(/append-only/);
  });
});

describe("assertSameOrigin", () => {
  const req = (headers: Record<string, string>) => new Request("http://app.test/api/x", { method: "POST", headers });

  it("rejects a cross-site request even when it carries no Origin or Referer", () => {
    expect(assertSameOrigin(req({ "sec-fetch-site": "cross-site" }))?.status).toBe(403);
  });

  it("still allows same-origin browser requests and header-less callers", () => {
    expect(assertSameOrigin(req({ "sec-fetch-site": "same-origin" }))).toBeNull();
    expect(assertSameOrigin(req({}))).toBeNull();
  });
});

describe("readSecret", () => {
  it("accepts any set secret outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("KIOSK_SECRET", "short");
    expect(readSecret("KIOSK_SECRET")).toBe("short");
  });

  it("refuses short and placeholder secrets in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KIOSK_SECRET", "twenty-one-chars-long");
    expect(readSecret("KIOSK_SECRET")).toBeUndefined();
    vi.stubEnv("KIOSK_SECRET", "replace-with-a-random-32-char-secret");
    expect(readSecret("KIOSK_SECRET")).toBeUndefined();
  });

  it("accepts a strong secret in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("KIOSK_SECRET", "k".repeat(48));
    expect(readSecret("KIOSK_SECRET")).toBe("k".repeat(48));
  });
});

describe("token claim types", () => {
  const secret = "s".repeat(40);
  const sign = (claims: Record<string, unknown>) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30s")
      .sign(new TextEncoder().encode(secret));

  it("rejects a kiosk token with no string locationId", async () => {
    vi.stubEnv("KIOSK_SECRET", secret);
    await expect(verifyKioskToken(await sign({ userId: "u1" }))).rejects.toThrow();
    await expect(verifyKioskToken(await sign({ locationId: { $ne: null } }))).rejects.toThrow();
  });

  it("rejects a session QR token with no string userId", async () => {
    vi.stubEnv("SESSION_QR_SECRET", secret);
    await expect(verifySessionQrToken(await sign({ locationId: "l1" }))).rejects.toThrow();
    await expect(verifySessionQrToken(await sign({ userId: { $ne: null } }))).rejects.toThrow();
  });
});

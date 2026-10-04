import { describe, expect, it } from "vitest";
import { errorSlug, translateApiError } from "@/lib/apiError";

const dict: Record<string, string> = {
  location_not_found: "KM:not found",
  PASSKEY_MISMATCH: "KM:mismatch",
  KIOSK_TOKEN_INVALID: "KM:kiosk",
};
const t: any = (k: string) => dict[k];
t.has = (k: string) => k in dict;

describe("translateApiError", () => {
  it("slugs the English message", () => {
    expect(errorSlug("Location not found")).toBe("location_not_found");
  });
  it("prefers a code, then the raw error, then the message slug", () => {
    expect(translateApiError(t, { code: "PASSKEY_MISMATCH", error: "x" }, "f")).toBe("KM:mismatch");
    expect(translateApiError(t, { error: "KIOSK_TOKEN_INVALID" }, "f")).toBe("KM:kiosk");
    expect(translateApiError(t, { error: "Location not found" }, "f")).toBe("KM:not found");
  });
  it("falls back to the server text, then the caller's fallback", () => {
    expect(translateApiError(t, { error: "Something odd" }, "f")).toBe("Something odd");
    expect(translateApiError(t, { error: { fieldErrors: {} } }, "f")).toBe("f");
  });
});

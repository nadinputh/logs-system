import { NextResponse } from "next/server";
import { verifyKioskToken } from "@/lib/jwt";
import { claim } from "@/lib/claim";

// A token proves one scan, so it may serve one visitor identity: the first
// sessionToken to present it owns it (a token lives minutes; see lib/claim.ts).
async function claimedBy(jti: string, sessionToken: string): Promise<boolean> {
  const prior = await claim(`kiosk:${jti}`, sessionToken);
  return prior === null || prior === sessionToken;
}

/**
 * The 15s QR itself is single-scan too. The scan page mints the longer presence
 * token from it, so without this a URL forwarded within the QR's life gets its
 * own presence token. Up to SCAN_SLOTS distinct devices (ip + user agent) may use
 * one QR, so a second visitor in the same window, or a stranger who opened the
 * URL first, does not lock the real one out, while a forwarded URL still earns
 * only a handful of tokens, each bound to one visitor identity. The same device
 * may reload; a further one is refused.
 */
export const SCAN_SLOTS = 3;
export async function claimScan(jti: string, fingerprint: string): Promise<boolean> {
  for (let slot = 0; slot < SCAN_SLOTS; slot++) {
    const prior = await claim(`kioskscan:${jti}:${slot}`, fingerprint);
    if (prior === null || prior === fingerprint) return true;
  }
  return false;
}

/**
 * Shared by every check-in write path. A supplied token must always match this
 * location; a location with `requireDynamicQr` additionally refuses a check-in
 * that carries no token at all (i.e. the static QR / typed URL).
 * Returns the 403 response to send, or null to proceed.
 */
export async function kioskGate(
  location: { requireDynamicQr?: boolean },
  locationId: string,
  kioskToken: string | undefined,
  sessionToken: string,
): Promise<NextResponse | null> {
  if (!kioskToken) {
    return location.requireDynamicQr
      ? NextResponse.json(
          {
            error: "KIOSK_TOKEN_REQUIRED",
            message: "This location only accepts check-in from the live kiosk QR.",
          },
          { status: 403 },
        )
      : null;
  }
  const ok = await verifyKioskToken(kioskToken)
    .then(
      async (t) =>
        // Only the longer-lived presence token minted by the scan page may back
        // a write. The raw 15s QR token is exchanged there (once, per device),
        // so accepting it directly would skip that device check.
        t.typ === "presence" &&
        t.locationId === locationId &&
        !!t.jti &&
        (await claimedBy(t.jti, sessionToken)),
    )
    .catch(() => false);
  return ok
    ? null
    : NextResponse.json(
        { error: "KIOSK_TOKEN_INVALID", message: "Scan the code on the kiosk again." },
        { status: 403 },
      );
}

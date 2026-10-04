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
 * own presence token. The first scanner's fingerprint (ip + user agent) owns the
 * QR's jti; the same device may reload, a different one is refused.
 */
export async function claimScan(jti: string, fingerprint: string): Promise<boolean> {
  const prior = await claim(`kioskscan:${jti}`, fingerprint);
  return prior === null || prior === fingerprint;
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

import { NextResponse } from "next/server";
import { verifyKioskToken } from "@/lib/jwt";

/**
 * Shared by every check-in write path. A supplied token must always match this
 * location; a location with `requireDynamicQr` additionally refuses a check-in
 * that carries no token at all (i.e. the static QR / typed URL).
 * Returns the 403 response to send, or null to proceed.
 */
export async function kioskGate(
  location: { requireDynamicQr?: boolean },
  locationId: string,
  kioskToken?: string,
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
    .then((t) => t.locationId === locationId)
    .catch(() => false);
  return ok
    ? null
    : NextResponse.json(
        { error: "KIOSK_TOKEN_INVALID", message: "Scan the code on the kiosk again." },
        { status: 403 },
      );
}

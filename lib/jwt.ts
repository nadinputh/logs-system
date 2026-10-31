import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";

import { readSecret } from "./secrets";

const enc = new TextEncoder();

// Fail closed: a missing (or, in production, weak) secret must reject, never
// silently skip verification.
function kioskSecret() {
  const s = readSecret("KIOSK_SECRET");
  if (!s) throw new Error("KIOSK_SECRET not configured");
  return enc.encode(s);
}

// The 15s default is the on-screen QR. The scan page re-signs a longer-lived
// "presence" token (see ttl) so the visitor can fill in the form before POST.
// `typ` says what the token is for. A "qr" token is the on-screen code and is the
// only thing that may be exchanged for a presence token; a "presence" token
// backs a check-in but can never be exchanged again, or one look at the kiosk
// would mint presence proof forever.
export type KioskTokenType = "qr" | "presence";

export async function signKioskToken(
  locationId: string,
  ttl = "15s",
  typ: KioskTokenType = "qr",
): Promise<string> {
  return new SignJWT({ locationId, typ })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(kioskSecret());
}

export async function verifyKioskToken(
  token: string,
): Promise<{ locationId: string; jti?: string; typ: KioskTokenType }> {
  const { payload } = await jwtVerify(token, kioskSecret(), {
    algorithms: ["HS256"],
    clockTolerance: 5,
  });
  // The claim comes from a signed token, but a token signed with the other
  // secret (or a mis-set shared one) has no locationId: reject it here rather
  // than let `undefined` flow into a comparison or a Mongo filter downstream.
  if (typeof payload.locationId !== "string") throw new Error("Invalid kiosk token");
  return {
    locationId: payload.locationId,
    jti: payload.jti,
    typ: payload.typ === "presence" ? "presence" : "qr",
  };
}

function sessionQrSecret() {
  const s = readSecret("SESSION_QR_SECRET");
  if (!s) throw new Error("SESSION_QR_SECRET not configured");
  return enc.encode(s);
}

export async function signSessionQrToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(sessionQrSecret());
}

export async function verifySessionQrToken(
  token: string,
): Promise<{ userId: string; jti?: string }> {
  const { payload } = await jwtVerify(token, sessionQrSecret(), {
    algorithms: ["HS256"],
  });
  // userId feeds User.findById and a TeamMember filter: it must be a string.
  if (typeof payload.userId !== "string") throw new Error("Invalid session QR token");
  return { userId: payload.userId, jti: payload.jti };
}

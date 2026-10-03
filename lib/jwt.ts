import { SignJWT, jwtVerify } from "jose";

const enc = new TextEncoder();

// Fail closed: a missing secret must reject, never silently skip verification.
function kioskSecret() {
  const s = process.env.KIOSK_SECRET;
  if (!s) throw new Error("KIOSK_SECRET not configured");
  return enc.encode(s);
}

// The 15s default is the on-screen QR. The scan page re-signs a longer-lived
// "presence" token (see ttl) so the visitor can fill in the form before POST.
export async function signKioskToken(
  locationId: string,
  ttl = "15s",
): Promise<string> {
  return new SignJWT({ locationId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(kioskSecret());
}

export async function verifyKioskToken(
  token: string,
): Promise<{ locationId: string }> {
  const { payload } = await jwtVerify(token, kioskSecret(), {
    algorithms: ["HS256"],
    clockTolerance: 5,
  });
  return { locationId: payload.locationId as string };
}

export async function signSessionQrToken(userId: string): Promise<string> {
  const secret = enc.encode(process.env.SESSION_QR_SECRET!);
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(secret);
}

export async function verifySessionQrToken(
  token: string,
): Promise<{ userId: string }> {
  const secret = enc.encode(process.env.SESSION_QR_SECRET!);
  const { payload } = await jwtVerify(token, secret);
  return { userId: payload.userId as string };
}

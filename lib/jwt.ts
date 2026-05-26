import { SignJWT, jwtVerify } from "jose";

const enc = new TextEncoder();

export async function signKioskToken(locationId: string): Promise<string> {
  const secret = enc.encode(process.env.KIOSK_SECRET!);
  return new SignJWT({ locationId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15s")
    .sign(secret);
}

export async function verifyKioskToken(
  token: string,
): Promise<{ locationId: string }> {
  const secret = enc.encode(process.env.KIOSK_SECRET!);
  const { payload } = await jwtVerify(token, secret);
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

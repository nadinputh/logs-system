import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { WebAuthnChallenge } from "@/lib/models/WebAuthnChallenge";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { assertSameOrigin } from "@/lib/csrf";
import { requireRecentSignIn } from "@/lib/server/recentSignIn";
import { RegistrationResponseSchema, safeTransports } from "@/lib/validations/webauthn";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const stale = await requireRecentSignIn((session.user as any).sid);
  if (stale) return stale;
  const userId = (session.user as any).id;

  // Shape and size checked before anything is consumed or persisted.
  const body = await req.json().catch(() => null);
  const parsedResponse = RegistrationResponseSchema.safeParse(body?.response);
  if (!parsedResponse.success) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  // Consumed atomically (two parallel submissions cannot both verify).
  const challengeDoc = await WebAuthnChallenge.findOneAndDelete({
    userId,
    type: "registration",
  });
  if (!challengeDoc) {
    return NextResponse.json(
      { error: "No pending registration challenge" },
      { status: 400 },
    );
  }

  const origin = process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`;
  const rpID = new URL(origin).hostname;

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: parsedResponse.data as any,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  // Bounded per user: sign-up is open, so an account could otherwise stack up
  // credential rows without limit.
  if ((await PasskeyCredential.countDocuments({ userId })) >= 20) {
    return NextResponse.json({ error: "Too many passkeys on this account" }, { status: 429 });
  }

  await PasskeyCredential.create({
    userId,
    credentialId: credential.id, // already Base64URLString
    publicKey: Buffer.from(credential.publicKey).toString("base64url"), // Uint8Array → base64url
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: safeTransports(credential.transports),
    lastUsedAt: new Date(),
  });

  return NextResponse.json({ verified: true });
}

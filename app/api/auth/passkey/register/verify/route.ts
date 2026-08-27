import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { WebAuthnChallenge } from "@/lib/models/WebAuthnChallenge";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const userId = (session.user as any).id;

  const challengeDoc = await WebAuthnChallenge.findOne({
    userId,
    type: "registration",
  });
  if (!challengeDoc) {
    return NextResponse.json(
      { error: "No pending registration challenge" },
      { status: 400 },
    );
  }

  const body = await req.json();
  const origin = process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`;
  const rpID = new URL(origin).hostname;

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  const { credential, credentialDeviceType, credentialBackedUp } =
    verification.registrationInfo;

  await PasskeyCredential.create({
    userId,
    credentialId: credential.id, // already Base64URLString
    publicKey: Buffer.from(credential.publicKey).toString("base64url"), // Uint8Array → base64url
    counter: credential.counter,
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    transports: credential.transports ?? [],
    lastUsedAt: new Date(),
  });

  await WebAuthnChallenge.deleteOne({ _id: challengeDoc._id });

  return NextResponse.json({ verified: true });
}

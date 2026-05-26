import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { WebAuthnChallenge } from "@/lib/models/WebAuthnChallenge";
import { PreAuthToken } from "@/lib/models/PreAuthToken";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { response, userId } = body;

  if (!response || !userId) {
    return NextResponse.json(
      { error: "response and userId required" },
      { status: 400 },
    );
  }

  await connectDB();

  const challengeDoc = await WebAuthnChallenge.findOne({
    userId,
    type: "authentication",
  });
  if (!challengeDoc) {
    return NextResponse.json(
      { error: "No pending authentication challenge" },
      { status: 400 },
    );
  }

  const cred = await PasskeyCredential.findOne({
    userId,
    credentialId: response.id,
  });
  if (!cred) {
    return NextResponse.json(
      { error: "Credential not found" },
      { status: 404 },
    );
  }

  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const rpID = new URL(origin).hostname;

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeDoc.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credentialId, // Base64URLString
        publicKey: Buffer.from(cred.publicKey, "base64url"), // base64url → Uint8Array
        counter: cred.counter,
        transports: cred.transports as any,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  await PasskeyCredential.updateOne(
    { _id: cred._id },
    {
      counter: verification.authenticationInfo.newCounter,
      lastUsedAt: new Date(),
    },
  );

  await WebAuthnChallenge.deleteOne({ _id: challengeDoc._id });

  const token = uuidv4();
  await PreAuthToken.create({
    token,
    userId,
    expiresAt: new Date(Date.now() + 60_000),
  });

  return NextResponse.json({ verified: true, preAuthToken: token });
}

import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { WebAuthnChallenge } from "@/lib/models/WebAuthnChallenge";
import { PreAuthToken } from "@/lib/models/PreAuthToken";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { v4 as uuidv4 } from "uuid";
import { assertSameOrigin } from "@/lib/csrf";
import { clientKey } from "@/lib/rateLimit";
import { rateLimitShared } from "@/lib/rateLimitShared";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const limited = await rateLimitShared(clientKey(req, "passkey-auth"), 10, 5 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  const body = await req.json();
  const { response, userId } = body;

  if (!response || !userId) {
    return NextResponse.json(
      { error: "response and userId required" },
      { status: 400 },
    );
  }

  await connectDB();

  // Not an ObjectId would throw a CastError (a 500) that real ids never do.
  if (!Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ error: "Passkey sign-in failed" }, { status: 400 });
  }

  const challengeDoc = await WebAuthnChallenge.findOne({
    userId,
    type: "authentication",
  });
  // One response for "no challenge" (unknown/decoy user), "no such credential"
  // and a failed assertion, so the endpoint is not an account oracle.
  const failed = () =>
    NextResponse.json({ error: "Passkey sign-in failed" }, { status: 400 });
  if (!challengeDoc) return failed();

  const cred = await PasskeyCredential.findOne({
    userId,
    credentialId: response.id,
  });
  if (!cred) return failed();

  const origin = process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`;
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
  } catch {
    return failed();
  }

  if (!verification.verified) return failed();

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

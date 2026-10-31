import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { WebAuthnChallenge } from "@/lib/models/WebAuthnChallenge";
import { PreAuthToken } from "@/lib/models/PreAuthToken";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { v4 as uuidv4 } from "uuid";
import { assertSameOrigin } from "@/lib/csrf";
import { hashToken } from "@/lib/verification";
import { clientKey } from "@/lib/rateLimit";
import { rateLimitShared } from "@/lib/rateLimitShared";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const limited = await rateLimitShared(clientKey(req, "passkey-auth-verify"), 10, 5 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  const { response, ceremonyId } = body ?? {};

  // response.id and ceremonyId go into Mongo filters; only plain strings may.
  if (
    typeof response?.id !== "string" ||
    typeof ceremonyId !== "string" ||
    !/^[0-9a-f]{32}$/.test(ceremonyId)
  ) {
    // Same body as every other failure: malformed input says nothing extra.
    return NextResponse.json({ error: "Passkey sign-in failed" }, { status: 400 });
  }

  await connectDB();

  // Consumed atomically up front: two simultaneous submissions of one captured
  // assertion cannot both find the challenge, so at most one can verify. (A failed
  // attempt burns it; the client simply asks for new options.)
  const challengeDoc = await WebAuthnChallenge.findOneAndDelete({
    ceremonyId,
    type: "authentication",
  });
  // One response for "no challenge" (unknown/decoy user), "no such credential"
  // and a failed assertion, so the endpoint is not an account oracle.
  const failed = () =>
    NextResponse.json({ error: "Passkey sign-in failed" }, { status: 400 });
  if (!challengeDoc) return failed();
  const userId = challengeDoc.userId;

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


  const token = uuidv4();
  await PreAuthToken.create({
    token: hashToken(token), // bearer credential: only the hash is stored
    userId,
    expiresAt: new Date(Date.now() + 60_000),
  });

  return NextResponse.json({ verified: true, preAuthToken: token });
}

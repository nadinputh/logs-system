import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";
import { VisitorPasskeyChallenge } from "@/lib/models/VisitorPasskeyChallenge";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { assertSameOrigin } from "@/lib/csrf";
import { limitByIp } from "@/lib/rateLimitGuard";
import { RegistrationResponseSchema, safeTransports } from "@/lib/validations/webauthn";

export const runtime = "nodejs";

const Schema = z.object({
  response: RegistrationResponseSchema,
  locationId: z.string().min(1).max(64),
  locationType: z.enum(["building", "floor", "room"]),
  sessionToken: z.string().uuid(),
  visitorName: z.string().max(100).optional(),
  visitorEmail: z.string().email().max(254).optional(),
  visitorPhone: z.string().max(30).optional(),
  visitorGender: z
    .enum(["male", "female", "non_binary", "prefer_not_to_say"])
    .optional(),
  visitPurpose: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const limited = await limitByIp(req, "passkey-visitor-reg", 20);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    response,
    locationId,
    locationType,
    sessionToken,
    visitorName,
    visitorEmail,
    visitorPhone,
    visitorGender,
    visitPurpose,
  } = parsed.data;

  await connectDB();

  const location = await findOwnedLocationByType(
    locationType as LocationType,
    locationId,
  );
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  const teamId = location.teamId.toString();

  const challengeDoc = await VisitorPasskeyChallenge.findOne({
    teamId,
    sessionToken,
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
      // Shape- and size-checked by RegistrationResponseSchema; the library validates the rest.
      response: response as any,
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

  const { credential } = verification.registrationInfo;

  // Consume the challenge first: the delete is the atomic gate, so parallel
  // verifies of one challenge cannot all pass the cap check below.
  const consumed: any = await VisitorPasskeyChallenge.deleteOne({ _id: challengeDoc._id });
  if (consumed?.deletedCount === 0) {
    return NextResponse.json({ error: "No pending registration challenge" }, { status: 400 });
  }

  // Unauthenticated writes: a software authenticator could otherwise mint
  // credential rows without bound against a public location id.
  if ((await VisitorPasskeyCredential.countDocuments({ teamId, sessionToken })) >= 5) {
    return NextResponse.json({ error: "Too many passkeys for this visitor" }, { status: 429 });
  }

  await VisitorPasskeyCredential.create({
    teamId,
    sessionToken,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: safeTransports(credential.transports),
    visitorName: visitorName ?? undefined,
    visitorEmail: visitorEmail ?? undefined,
    visitorPhone: visitorPhone ?? undefined,
    visitorGender: visitorGender ?? undefined,
    visitPurpose: visitPurpose ?? undefined,
    lastUsedAt: new Date(),
  });

  return NextResponse.json({ verified: true });
}

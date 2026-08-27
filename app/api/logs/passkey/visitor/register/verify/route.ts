import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";
import { VisitorPasskeyChallenge } from "@/lib/models/VisitorPasskeyChallenge";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const Schema = z.object({
  response: z.any(),
  locationId: z.string().min(1),
  locationType: z.enum(["building", "floor", "room"]),
  sessionToken: z.string().uuid(),
  visitorName: z.string().optional(),
  visitorEmail: z.string().email().optional(),
  visitorPhone: z.string().max(30).optional(),
  visitorGender: z
    .enum(["male", "female", "non_binary", "prefer_not_to_say"])
    .optional(),
  visitPurpose: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const body = await req.json();
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
      response,
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

  const { credential } = verification.registrationInfo;

  await VisitorPasskeyCredential.create({
    teamId,
    sessionToken,
    credentialId: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? [],
    visitorName: visitorName ?? undefined,
    visitorEmail: visitorEmail ?? undefined,
    visitorPhone: visitorPhone ?? undefined,
    visitorGender: visitorGender ?? undefined,
    visitPurpose: visitPurpose ?? undefined,
    lastUsedAt: new Date(),
  });

  await VisitorPasskeyChallenge.deleteOne({ _id: challengeDoc._id });

  return NextResponse.json({ verified: true });
}

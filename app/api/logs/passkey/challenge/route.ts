import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { PasskeyCheckInChallenge } from "@/lib/models/PasskeyCheckInChallenge";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const ChallengeSchema = z.object({
  locationId: z.string().min(1),
  locationType: z.enum(["building", "floor", "room"]),
  action: z.enum(["in", "out"]),
  sessionToken: z.string().uuid(),
  relatedLogId: z.string().optional(),
  idempotencyKey: z.string().min(1),
  visitorName: z.string().min(1).max(100).optional(),
  visitorEmail: z.string().email().optional(),
  visitorPhone: z.string().max(30).optional(),
  visitorGender: z
    .enum(["male", "female", "non_binary", "prefer_not_to_say"])
    .optional(),
  visitPurpose: z.string().max(200).optional(),
  deviceId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const body = await req.json();
  const parsed = ChallengeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    locationId,
    locationType,
    action,
    sessionToken,
    relatedLogId,
    idempotencyKey,
    visitorName,
    visitorEmail,
    visitorPhone,
    visitorGender,
    visitPurpose,
    deviceId,
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

  // Remove any stale pending challenge for this session + action (e.g. user cancelled then retried)
  await PasskeyCheckInChallenge.deleteMany({ teamId, sessionToken, action });

  const rpID = new URL(process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`)
    .hostname;

  // Discoverable credentials: allowCredentials:[] lets the OS pick any registered passkey
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [],
    userVerification: "required",
  });

  await PasskeyCheckInChallenge.create({
    challenge: options.challenge,
    teamId,
    locationId,
    locationType,
    action,
    sessionToken,
    relatedLogId,
    idempotencyKey,
    visitorName: visitorName ?? undefined,
    visitorEmail: visitorEmail ?? undefined,
    visitorPhone: visitorPhone ?? undefined,
    visitorGender: visitorGender ?? undefined,
    visitPurpose: visitPurpose ?? undefined,
    deviceId: deviceId ?? undefined,
  });

  return NextResponse.json(options);
}

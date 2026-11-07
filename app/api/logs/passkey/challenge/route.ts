import { kioskGate } from "@/lib/kioskGate";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { PasskeyCheckInChallenge } from "@/lib/models/PasskeyCheckInChallenge";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { assertSameOrigin } from "@/lib/csrf";
import { limitByIp } from "@/lib/rateLimitGuard";

export const runtime = "nodejs";

const ChallengeSchema = z.object({
  locationId: z.string().min(1).max(64),
  locationType: z.enum(["building", "floor", "room"]),
  action: z.enum(["in", "out"]),
  sessionToken: z.string().uuid(),
  relatedLogId: z.string().max(64).optional(),
  idempotencyKey: z.string().min(1).max(128),
  visitorName: z.string().min(1).max(100).optional(),
  visitorEmail: z.string().email().max(254).optional(),
  visitorPhone: z.string().max(30).optional(),
  visitorGender: z
    .enum(["male", "female", "non_binary", "prefer_not_to_say"])
    .optional(),
  visitPurpose: z.string().max(200).optional(),
  deviceId: z.string().max(64).optional(),
  kioskToken: z.string().max(2048).optional(),
});

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const limited = await limitByIp(req, "passkey-challenge", 30);
  if (limited) return limited;

  const body = await req.json().catch(() => null);
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
    kioskToken,
  } = parsed.data;

  await connectDB();

  const location = await findOwnedLocationByType(
    locationType as LocationType,
    locationId,
  );
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  // Only the check-in leg needs proof of presence; checkout does not.
  //
  // A passkey-mode location always demands the live kiosk QR. A visitor passkey
  // is registered from nothing (no account, attestation "none"), so a script's
  // software authenticator would otherwise earn `passkeyVerified: true` from
  // anywhere. The passkey is the device continuity; the live QR is the presence.
  if (action === "in") {
    const gate = await kioskGate(
      {
        requireDynamicQr:
          location.requireDynamicQr || location.checkInMode === "passkey",
      },
      locationId,
      kioskToken,
      sessionToken,
    );
    if (gate) return gate;
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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { PasskeyCheckInChallenge } from "@/lib/models/PasskeyCheckInChallenge";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

export const runtime = "nodejs";

const ChallengeSchema = z.object({
  locationId: z.string().min(1),
  locationType: z.enum(["building", "floor", "room"]),
  action: z.enum(["in", "out"]),
  sessionToken: z.string().uuid(),
  relatedLogId: z.string().optional(),
  idempotencyKey: z.string().min(1),
});

export async function POST(req: NextRequest) {
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
  } = parsed.data;

  await connectDB();

  // Remove any stale pending challenge for this session + action (e.g. user cancelled then retried)
  await PasskeyCheckInChallenge.deleteMany({ sessionToken, action });

  const rpID = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    .hostname;

  // Discoverable credentials: allowCredentials:[] lets the OS pick any registered passkey
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [],
    userVerification: "required",
  });

  await PasskeyCheckInChallenge.create({
    challenge: options.challenge,
    locationId,
    locationType,
    action,
    sessionToken,
    relatedLogId,
    idempotencyKey,
  });

  return NextResponse.json(options);
}

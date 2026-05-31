import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";
import { VisitorPasskeyChallenge } from "@/lib/models/VisitorPasskeyChallenge";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { generateRegistrationOptions } from "@simplewebauthn/server";

export const runtime = "nodejs";

const Schema = z.object({
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

function buildVisitorPasskeyNames({
  visitorName,
  visitorEmail,
  visitorPhone,
  sessionToken,
}: {
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  sessionToken: string;
}) {
  const contact = visitorEmail?.trim() || visitorPhone?.trim();
  const name = visitorName?.trim();

  return {
    userName: contact || name || `visitor-${sessionToken.slice(0, 8)}`,
    userDisplayName:
      name && contact ? `${name} (${contact})` : name || contact || "Visitor",
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    locationId,
    locationType,
    sessionToken,
    visitorName,
    visitorEmail,
    visitorPhone,
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

  const existing = await VisitorPasskeyCredential.find({
    teamId,
    sessionToken,
  }).lean();

  // Derive a deterministic 16-byte userID from the sessionToken
  const userID = createHash("sha256")
    .update(sessionToken)
    .digest()
    .subarray(0, 16);

  const rpID = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    .hostname;
  const { userName, userDisplayName } = buildVisitorPasskeyNames({
    visitorName,
    visitorEmail,
    visitorPhone,
    sessionToken,
  });

  const options = await generateRegistrationOptions({
    rpName: "Check-In System",
    rpID,
    userID,
    userName,
    userDisplayName,
    attestationType: "none",
    excludeCredentials: existing.map((c: any) => ({
      id: c.credentialId as string,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
  });

  // Remove any stale pending challenge for this visitor session
  await VisitorPasskeyChallenge.deleteMany({ teamId, sessionToken });
  await VisitorPasskeyChallenge.create({
    teamId,
    sessionToken,
    challenge: options.challenge,
  });

  return NextResponse.json(options);
}

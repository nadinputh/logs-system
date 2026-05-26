import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";
import { VisitorPasskeyChallenge } from "@/lib/models/VisitorPasskeyChallenge";
import { generateRegistrationOptions } from "@simplewebauthn/server";

export const runtime = "nodejs";

const Schema = z.object({
  sessionToken: z.string().uuid(),
  visitorName: z.string().optional(),
  visitorEmail: z.string().email().optional(),
  visitorPhone: z.string().max(30).optional(),
  visitorGender: z.enum(["male", "female", "non_binary", "prefer_not_to_say"]).optional(),
  visitPurpose: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { sessionToken, visitorName } = parsed.data;

  await connectDB();

  const existing = await VisitorPasskeyCredential.find({ sessionToken }).lean();

  // Derive a deterministic 16-byte userID from the sessionToken
  const userID = createHash("sha256")
    .update(sessionToken)
    .digest()
    .subarray(0, 16);

  const rpID = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000")
    .hostname;

  const options = await generateRegistrationOptions({
    rpName: "Check-In System",
    rpID,
    userID,
    userName: sessionToken.slice(0, 8),
    userDisplayName: visitorName ?? "Visitor",
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
  await VisitorPasskeyChallenge.deleteMany({ sessionToken });
  await VisitorPasskeyChallenge.create({
    sessionToken,
    challenge: options.challenge,
  });

  return NextResponse.json(options);
}

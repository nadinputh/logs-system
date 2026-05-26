import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";
import { VisitorPasskeyChallenge } from "@/lib/models/VisitorPasskeyChallenge";
import { verifyRegistrationResponse } from "@simplewebauthn/server";

export const runtime = "nodejs";

const Schema = z.object({
  response: z.any(),
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

  const { response, sessionToken, visitorName, visitorEmail, visitorPhone, visitorGender, visitPurpose } = parsed.data;

  await connectDB();

  const challengeDoc = await VisitorPasskeyChallenge.findOne({ sessionToken });
  if (!challengeDoc) {
    return NextResponse.json(
      { error: "No pending registration challenge" },
      { status: 400 },
    );
  }

  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
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

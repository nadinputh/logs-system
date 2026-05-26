import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { WebAuthnChallenge } from "@/lib/models/WebAuthnChallenge";
import { User } from "@/lib/models/User";
import { generateAuthenticationOptions } from "@simplewebauthn/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  await connectDB();

  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const userId = (user as any)._id.toString();
  const credentials = await PasskeyCredential.find({ userId }).lean();
  if (credentials.length === 0) {
    return NextResponse.json(
      { error: "No passkeys registered for this account" },
      { status: 400 },
    );
  }

  const options = await generateAuthenticationOptions({
    rpID: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000").hostname,
    allowCredentials: credentials.map((c: any) => ({
      id: c.credentialId as string,
      transports: c.transports,
    })),
    userVerification: "preferred",
  });

  await WebAuthnChallenge.deleteMany({ userId, type: "authentication" });
  await WebAuthnChallenge.create({
    userId,
    challenge: options.challenge,
    type: "authentication",
  });

  return NextResponse.json({ ...options, userId });
}

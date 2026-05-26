import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { WebAuthnChallenge } from "@/lib/models/WebAuthnChallenge";
import { User } from "@/lib/models/User";
import { generateRegistrationOptions } from "@simplewebauthn/server";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();
  const userId = (session.user as any).id;
  const user = await User.findById(userId).lean();
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const existingCredentials = await PasskeyCredential.find({ userId }).lean();

  const options = await generateRegistrationOptions({
    rpName: "Check-In System",
    rpID: new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000").hostname,
    userName: (user as any).email,
    userDisplayName: (user as any).name,
    attestationType: "none",
    excludeCredentials: existingCredentials.map((c: any) => ({
      id: c.credentialId as string,
      transports: c.transports,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: "platform",
    },
  });

  await WebAuthnChallenge.deleteMany({ userId, type: "registration" });
  await WebAuthnChallenge.create({
    userId,
    challenge: options.challenge,
    type: "registration",
  });

  return NextResponse.json(options);
}

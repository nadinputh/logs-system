import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { WebAuthnChallenge } from "@/lib/models/WebAuthnChallenge";
import { User } from "@/lib/models/User";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { assertSameOrigin } from "@/lib/csrf";
import { clientKey } from "@/lib/rateLimit";
import { rateLimitShared } from "@/lib/rateLimitShared";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  // Unauthenticated and keyed by an email the caller supplies — an
  // unthrottled 404-vs-200 response is an account-enumeration oracle.
  const limited = await rateLimitShared(clientKey(req, "passkey-auth"), 10, 5 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  const body = await req.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  await connectDB();

  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  const credentials = user
    ? await PasskeyCredential.find({ userId: (user as any)._id }).lean()
    : [];

  const rpID = new URL(
    process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`,
  ).hostname;

  // Same shape for every address. An unknown email or an account with no
  // passkey gets a stable, HMAC-derived decoy id/credential, so neither the
  // status code nor the body says whether the account exists. The decoy can
  // never verify: no challenge is stored for it and no credential matches.
  if (!user || credentials.length === 0) {
    const decoy = createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "")
      .update(email.toLowerCase())
      .digest();
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: [
        { id: decoy.toString("base64url"), transports: ["internal"] },
      ],
      userVerification: "preferred",
    });
    return NextResponse.json({
      ...options,
      userId: decoy.subarray(0, 12).toString("hex"),
    });
  }

  const userId = (user as any)._id.toString();
  const options = await generateAuthenticationOptions({
    rpID,
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

import { createHmac, randomBytes } from "node:crypto";
import { Types } from "mongoose";
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
  const limited = await rateLimitShared(clientKey(req, "passkey-auth-options"), 10, 5 * 60 * 1000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  const email: unknown = body?.email;

  if (typeof email !== "string" || !email || email.length > 254) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  await connectDB();

  const user = await User.findOne({ email: email.toLowerCase() }).lean();
  // The same two reads for every address (a throwaway id when there is no user),
  // so an unknown email does not take measurably less time than a real one.
  const credentials = await PasskeyCredential.find({
    userId: (user as any)?._id ?? new Types.ObjectId(),
  }).lean();

  const rpID = new URL(
    process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`,
  ).hostname;

  // Same shape for every address. An unknown email or an account with no
  // passkey gets a stable, HMAC-derived decoy (ceremony id, credential count,
  // ids, transports), so neither the status code nor the body says whether the
  // account exists. The decoy can never verify: its stored challenge belongs to a
  // user id nobody owns, so no credential can match it.
  // No user id is ever returned: the client echoes an opaque ceremony id.
  if (!user || credentials.length === 0) {
    // Domain-separated from every other use of the secret.
    const decoy = createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "")
      .update(`passkey-decoy:${email.toLowerCase()}`)
      .digest();
    // Real accounts hold anywhere from one to several passkeys, with whatever
    // transports their authenticators reported (sometimes none).
    const count = [1, 1, 1, 2, 2, 3, 4, 5, 6, 8][decoy[31] % 10];
    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: Array.from({ length: count }, (_, i) => {
        // Platform authenticators (registration asks for authenticatorAttachment
        // "platform") produce a few recurring shapes: ids of 16, 20 or 32 bytes
        // (occasionally 48-64), transports internal / hybrid+internal / none.
        // getTransports() returns them sorted, so "hybrid" precedes "internal".
        const len = [32, 32, 32, 32, 32, 20, 20, 16, 16, 48, 64][decoy[8 + (i % 8)] % 11];
        // Two 32-byte HMAC blocks (64 bytes), truncated to `len`.
        const id = Buffer.concat(
          [0, 1].map((k) => createHmac("sha256", decoy).update(`${i}:${k}`).digest()),
        ).subarray(0, len);
        const t = decoy[20 + (i % 8)] % 5;
        // Always present, like a real entry (stored as an array, possibly empty):
        // a missing key would itself mark a decoy.
        const transports: any = t === 0 ? [] : t <= 2 ? ["internal"] : ["hybrid", "internal"];
        return { id: id.toString("base64url"), transports };
      }),
      userVerification: "required",
    });
    // Same database write as a real ceremony, against a user that does not
    // exist, so timing does not tell the two apart. It can never verify: no
    // credential belongs to that user id.
    const ceremonyId = randomBytes(16).toString("hex");
    await WebAuthnChallenge.create({
      userId: new Types.ObjectId(),
      ceremonyId,
      challenge: options.challenge,
      type: "authentication",
    });
    return NextResponse.json({ ...options, ceremonyId });
  }

  const userId = (user as any)._id.toString();
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credentials.map((c: any) => ({
      id: c.credentialId as string,
      transports: c.transports ?? [],
    })),
    userVerification: "required",
  });

  // Several ceremonies may be outstanding at once (the 5-minute TTL expires
  // them), so requesting options for someone's email cannot cancel their login.
  const ceremonyId = randomBytes(16).toString("hex");
  await WebAuthnChallenge.create({
    userId,
    ceremonyId,
    challenge: options.challenge,
    type: "authentication",
  });

  return NextResponse.json({ ...options, ceremonyId });
}

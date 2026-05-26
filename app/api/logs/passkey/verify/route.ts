import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";
import { PasskeyCheckInChallenge } from "@/lib/models/PasskeyCheckInChallenge";
import { checkIdempotency, saveIdempotency } from "@/lib/idempotency";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";

export const runtime = "nodejs";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    response,
    locationId,
    locationType,
    action,
    sessionToken,
    relatedLogId,
    idempotencyKey,
    visitorName,
  } = body;

  if (
    !response ||
    !locationId ||
    !locationType ||
    !action ||
    !sessionToken ||
    !idempotencyKey
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  // Step 1: Extract challenge from signed clientDataJSON
  let challenge: string;
  try {
    const clientData = JSON.parse(
      Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8"),
    );
    challenge = clientData.challenge;
  } catch {
    return NextResponse.json(
      { error: "Malformed clientDataJSON" },
      { status: 400 },
    );
  }

  await connectDB();

  // Step 2: Look up stored intent by challenge
  const intentDoc = await PasskeyCheckInChallenge.findOne({ challenge });
  if (!intentDoc) {
    return NextResponse.json(
      { error: "Challenge not found or expired" },
      { status: 400 },
    );
  }

  // Step 3: Assert all intent fields match — prevents challenge reuse for a different check-in
  if (
    intentDoc.locationId !== locationId ||
    intentDoc.locationType !== locationType ||
    intentDoc.action !== action ||
    intentDoc.sessionToken !== sessionToken ||
    intentDoc.idempotencyKey !== idempotencyKey
  ) {
    return NextResponse.json(
      {
        error: "Intent mismatch — challenge was issued for a different request",
      },
      { status: 400 },
    );
  }

  // Step 4: Replay idempotency cache if this key was already committed
  const cached = await checkIdempotency(idempotencyKey);
  if (cached) {
    return NextResponse.json(cached.body, { status: cached.statusCode });
  }

  // Step 5: Resolve credential — try staff first, then visitor
  const staffCred = await PasskeyCredential.findOne({ credentialId: response.id });
  const visitorCred = staffCred
    ? null
    : await VisitorPasskeyCredential.findOne({ credentialId: response.id });

  if (!staffCred && !visitorCred) {
    return NextResponse.json(
      { error: "Passkey not registered on this server" },
      { status: 401 },
    );
  }

  const resolvedUserId = staffCred ? staffCred.userId.toString() : null;
  const credPublicKey = staffCred
    ? Buffer.from(staffCred.publicKey, "base64url")
    : Buffer.from(visitorCred!.publicKey, "base64url");
  const credCounter = staffCred ? staffCred.counter : visitorCred!.counter;
  const credId = staffCred ? staffCred.credentialId : visitorCred!.credentialId;
  const credTransports = staffCred ? staffCred.transports : visitorCred!.transports;

  const origin = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const rpID = new URL(origin).hostname;

  // Step 6: Cryptographic verification
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: intentDoc.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credId,
        publicKey: credPublicKey,
        counter: credCounter,
        transports: credTransports as any,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  // Step 7: Advance counter (replay-attack prevention) and record last use
  if (staffCred) {
    await PasskeyCredential.updateOne(
      { _id: staffCred._id },
      { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    );
  } else {
    await VisitorPasskeyCredential.updateOne(
      { _id: visitorCred!._id },
      { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    );
  }

  // Step 8: Delete the consumed challenge
  await PasskeyCheckInChallenge.deleteOne({ _id: intentDoc._id });

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  // Step 9: Write the append-only log entry with passkeyVerified: true
  let log;
  if (action === "in") {
    // Idempotency check: reject if already checked in without checkout
    const checkinQuery = resolvedUserId
      ? { locationId, userId: resolvedUserId, action: "in" as const }
      : { locationId, sessionToken, action: "in" as const };
    const lastCheckin = await Log.findOne(checkinQuery).sort({ timestamp: -1 });
    if (lastCheckin) {
      const existingCheckout = await Log.findOne({
        relatedLogId: lastCheckin._id,
        action: "out",
      });
      if (!existingCheckout) {
        const payload = { existing: true, log: lastCheckin };
        await saveIdempotency(idempotencyKey, 200, payload);
        return NextResponse.json(payload, { status: 200 });
      }
    }

    log = await Log.create({
      locationId,
      locationType,
      sessionToken,
      ...(resolvedUserId && { userId: resolvedUserId }),
      visitorName,
      ipAddress,
      userAgent,
      action: "in",
      passkeyVerified: true,
      timestamp: new Date(),
    });
  } else {
    // action === 'out'
    if (!relatedLogId) {
      return NextResponse.json(
        { error: "relatedLogId required for checkout" },
        { status: 400 },
      );
    }

    const checkinLog = await Log.findOne({ _id: relatedLogId, action: "in" });
    if (!checkinLog) {
      return NextResponse.json(
        { error: "Check-in log not found" },
        { status: 404 },
      );
    }

    const existing = await Log.findOne({
      relatedLogId: checkinLog._id,
      action: "out",
    });
    if (existing) {
      const payload = { already: true, log: existing };
      await saveIdempotency(idempotencyKey, 200, payload);
      return NextResponse.json(payload, { status: 200 });
    }

    log = await Log.create({
      locationId: checkinLog.locationId,
      locationType: checkinLog.locationType,
      sessionToken: checkinLog.sessionToken,
      ...(checkinLog.userId && { userId: checkinLog.userId }),
      visitorName: checkinLog.visitorName,
      ipAddress,
      userAgent,
      action: "out",
      relatedLogId: checkinLog._id,
      passkeyVerified: true,
      timestamp: new Date(),
    });
  }

  // Step 10: Commit idempotency key so the same ceremony can never write twice
  const responsePayload = { verified: true, log: log.toObject() };
  await saveIdempotency(idempotencyKey, 201, responsePayload);

  return NextResponse.json(responsePayload, { status: 201 });
}

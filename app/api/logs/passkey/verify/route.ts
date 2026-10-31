import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { TeamMember } from "@/lib/models/TeamMember";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";
import { PasskeyCheckInChallenge } from "@/lib/models/PasskeyCheckInChallenge";
import { checkIdempotency, saveIdempotency } from "@/lib/idempotency";
import { publishLogCreated } from "@/lib/realtime/logEvents";
import { getClientIp } from "@/lib/server/getClientIp";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { resolveBuildingId, computeGeofenceStatus } from "@/lib/geofence";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { assertSameOrigin } from "@/lib/csrf";
import { acquireCheckInLock } from "@/lib/checkInLock";
import { publicLog } from "@/lib/checkoutLog";
import { limitByIp } from "@/lib/rateLimitGuard";
import { z } from "zod";
import { Types } from "mongoose";

export const runtime = "nodejs";

// Every field below reaches a Mongo filter. Anything that is not a plain string
// (e.g. {"$ne":null}) would be read as an operator, so shape is enforced up front.
const VerifySchema = z.object({
  response: z.object({
    id: z.string().min(1).max(1024),
    response: z.object({ clientDataJSON: z.string().min(1).max(4096) }).loose(),
  }).loose(),
  locationId: z.string().min(1).max(64),
  locationType: z.enum(["building", "floor", "room"]),
  action: z.enum(["in", "out"]),
  sessionToken: z.string().uuid(),
  relatedLogId: z.string().refine((v) => Types.ObjectId.isValid(v)).optional(),
  idempotencyKey: z.string().min(1).max(128),
  visitorName: z.string().max(100).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const limited = await limitByIp(req, "passkey-checkin", 30);
  if (limited) return limited;

  const parsedBody = VerifySchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }
  const {
    response,
    locationId,
    locationType,
    action,
    sessionToken,
    relatedLogId,
    idempotencyKey,
    visitorName: bodyVisitorName,
    latitude,
    longitude,
  } = parsedBody.data;

  // Step 1: Extract challenge from signed clientDataJSON
  let challenge: string;
  try {
    const clientData = JSON.parse(
      Buffer.from(response.response.clientDataJSON, "base64url").toString(
        "utf8",
      ),
    );
    if (typeof clientData.challenge !== "string") throw new Error("challenge");
    challenge = clientData.challenge;
  } catch {
    return NextResponse.json(
      { error: "Malformed clientDataJSON" },
      { status: 400 },
    );
  }

  await connectDB();

  // Step 2: Look up stored intent by challenge
  // Consumed atomically up front: a captured assertion submitted twice at once
  // can only find the challenge once, so only one request can verify and write.
  const intentDoc = await PasskeyCheckInChallenge.findOneAndDelete({ challenge });
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
    intentDoc.idempotencyKey !== idempotencyKey ||
    // A check-out challenge names the visit it closes; without this the same
    // assertion could be replayed against a different relatedLogId.
    (intentDoc.relatedLogId ?? undefined) !== (relatedLogId ?? undefined)
  ) {
    return NextResponse.json(
      {
        error: "Intent mismatch — challenge was issued for a different request",
      },
      { status: 400 },
    );
  }

  const teamId = intentDoc.teamId;
  if (!teamId) {
    return NextResponse.json(
      { error: "Challenge is missing team context" },
      { status: 400 },
    );
  }

  // Step 4: Look up a cached response for this idempotency key. It is only
  // REPLAYED after the assertion below has verified (step 8b): returning it here
  // would hand a stored response (log, visitor details) to anyone who presents
  // the key, without proving they hold the passkey.
  const cached = await checkIdempotency(idempotencyKey);

  // Step 5: Resolve credential — try staff first, then visitor
  const anyStaffCred = await PasskeyCredential.findOne({
    credentialId: response.id,
  });
  // Staff passkeys are looked up globally, so being a passkey holder says
  // nothing about this team. Without a membership check, a member of team A
  // could write attributed logs into team B's locations. A non-member is
  // treated as unregistered here (the client then offers guest registration).
  const staffCred =
    anyStaffCred &&
    (await TeamMember.exists({
      teamId,
      userId: anyStaffCred.userId,
      status: "active",
    }))
      ? anyStaffCred
      : null;
  const visitorCred = staffCred
    ? null
    : await VisitorPasskeyCredential.findOne({
        credentialId: response.id,
        teamId,
      });

  if (!staffCred && !visitorCred) {
    return NextResponse.json(
      {
        code: "PASSKEY_NOT_REGISTERED",
        error: "This passkey is not registered for this team",
      },
      { status: 401 },
    );
  }

  const resolvedUserId = staffCred ? staffCred.userId.toString() : null;
  const credPublicKey = staffCred
    ? Buffer.from(staffCred.publicKey, "base64url")
    : Buffer.from(visitorCred!.publicKey, "base64url");
  const credCounter = staffCred ? staffCred.counter : visitorCred!.counter;
  const credId = staffCred ? staffCred.credentialId : visitorCred!.credentialId;
  const credTransports = staffCred
    ? staffCred.transports
    : visitorCred!.transports;

  const origin =
    process.env.NEXTAUTH_URL ??
    `http://localhost:${process.env.PORT ?? "4000"}`;
  const rpID = new URL(origin).hostname;

  // Step 6: Cryptographic verification
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      // Shape-checked above; the library validates the rest of the assertion.
      response: response as unknown as AuthenticationResponseJSON,
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
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  }

  // Step 7: Advance counter (replay-attack prevention) and record last use
  if (staffCred) {
    await PasskeyCredential.updateOne(
      { _id: staffCred._id },
      {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    );
  } else {
    await VisitorPasskeyCredential.updateOne(
      { _id: visitorCred!._id },
      {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    );
  }

  // Step 8: (the challenge was already consumed atomically at step 2)

  // Step 8b: the caller has now proven possession of the passkey, so a retry of a
  // check-in that already committed gets its original response instead of a
  // second row.
  if (cached && action !== "out") {
    const cachedBody = cached.body as any;
    const cachedLogId = cachedBody?.log?._id ?? cachedBody?.log?.id;
    if (cachedLogId) {
      const cachedCheckout = await Log.findOne({
        teamId,
        relatedLogId: cachedLogId,
        action: "out",
      })
        .select("_id")
        .lean();

      if (!cachedCheckout) {
        return NextResponse.json(cached.body, { status: cached.statusCode });
      }
    }
  }

  const ipAddress = getClientIp(req);
  const userAgent = (req.headers.get("user-agent") ?? undefined)?.slice(0, 256);
  const visitorName = intentDoc.visitorName ?? bodyVisitorName;

  // Step 9: Write the append-only log entry with passkeyVerified: true.
  // Check-in is serialised per visitor (see lib/checkInLock.ts); check-out is
  // already closed once by the unique index on relatedLogId.
  const release =
    action === "in"
      ? await acquireCheckInLock(
          teamId,
          locationId,
          resolvedUserId ?? sessionToken,
        )
      : async () => {};
  if (!release) {
    return NextResponse.json(
      {
        error: "CHECKIN_IN_PROGRESS",
        message: "Check-in already in progress, try again.",
      },
      { status: 409 },
    );
  }
  try {
    let log;
    if (action === "in") {
      // Idempotency check: reject if already checked in without checkout
      const checkinQuery = resolvedUserId
        ? { teamId, locationId, userId: resolvedUserId, action: "in" as const }
        : { teamId, locationId, sessionToken, action: "in" as const };
      const lastCheckin = await Log.findOne(checkinQuery).sort({
        timestamp: -1,
      });
      if (lastCheckin) {
        const existingCheckout = await Log.findOne({
          teamId,
          relatedLogId: lastCheckin._id,
          action: "out",
        });
        if (!existingCheckout) {
          const payload = { existing: true, log: publicLog(lastCheckin) };
          await saveIdempotency(idempotencyKey, 200, payload);
          return NextResponse.json(payload, { status: 200 });
        }
      }

      const passkeyLocation = await findOwnedLocationByType(
        locationType as LocationType,
        locationId,
      );
      const geofenceStatus = passkeyLocation
        ? await computeGeofenceStatus(
            resolveBuildingId(locationType as LocationType, passkeyLocation),
            latitude,
            longitude,
          )
        : undefined;

      log = await Log.create({
        teamId,
        locationId,
        locationType,
        sessionToken,
        ...(resolvedUserId && { userId: resolvedUserId }),
        visitorName: visitorName ?? undefined,
        visitorEmail: intentDoc.visitorEmail ?? undefined,
        visitorPhone: intentDoc.visitorPhone ?? undefined,
        visitorGender: intentDoc.visitorGender ?? undefined,
        visitPurpose: intentDoc.visitPurpose ?? undefined,
        deviceId: intentDoc.deviceId ?? undefined,
        ipAddress,
        userAgent,
        geofenceStatus,
        action: "in",
        passkeyVerified: true,
        passkeyCredentialId: credId,
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

      const checkinLog = await Log.findOne({
        _id: relatedLogId,
        teamId,
        action: "in",
      });
      if (!checkinLog) {
        return NextResponse.json(
          { error: "Check-in log not found" },
          { status: 404 },
        );
      }

      if (!checkinLog.passkeyVerified) {
        return NextResponse.json(
          {
            code: "CHECKIN_NOT_PASSKEY_VERIFIED",
            error: "Original check-in was not passkey verified",
          },
          { status: 400 },
        );
      }

      if (!checkinLog.passkeyCredentialId) {
        return NextResponse.json(
          {
            code: "PASSKEY_CREDENTIAL_CONTEXT_MISSING",
            error: "Original check-in is missing passkey credential context",
          },
          { status: 409 },
        );
      }

      if (checkinLog.passkeyCredentialId !== credId) {
        return NextResponse.json(
          {
            code: "PASSKEY_MISMATCH",
            error: "This is not the same passkey used to check in",
          },
          { status: 403 },
        );
      }

      if (cached) {
        const cachedBody = cached.body as any;
        const cachedLogId = cachedBody?.log?._id ?? cachedBody?.log?.id;
        if (cachedLogId) {
          const cachedCheckout = await Log.findOne({
            _id: cachedLogId,
            teamId,
            relatedLogId,
            action: "out",
          })
            .select("_id")
            .lean();

          if (cachedCheckout) {
            return NextResponse.json(cached.body, {
              status: cached.statusCode,
            });
          }
        }
      }

      const existing = await Log.findOne({
        teamId,
        relatedLogId: checkinLog._id,
        action: "out",
      });
      if (existing) {
        const payload = { already: true, log: publicLog(existing) };
        await saveIdempotency(idempotencyKey, 200, payload);
        return NextResponse.json(payload, { status: 200 });
      }

      log = await Log.create({
        teamId,
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
        passkeyCredentialId: credId,
        timestamp: new Date(),
      });
    }

    // Step 10: Commit idempotency key so the same ceremony can never write twice
    publishLogCreated(log);
    const responsePayload = { verified: true, log: publicLog(log) };
    await saveIdempotency(idempotencyKey, 201, responsePayload);

    return NextResponse.json(responsePayload, { status: 201 });
  } finally {
    await release();
  }
}

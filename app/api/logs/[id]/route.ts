import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { publishLogCreated } from "@/lib/realtime/logEvents";
import { getClientIp } from "@/lib/server/getClientIp";
import { checkIdempotency, saveIdempotency } from "@/lib/idempotency";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { sessionToken } = body;

  if (!sessionToken) {
    return NextResponse.json(
      { error: "sessionToken required" },
      { status: 400 },
    );
  }

  // Check-out is a write, so it carries the same replay guard as check-in.
  // The `existing` lookup below is correct in sequence but not atomic: two taps
  // racing can both read "no check-out yet" and both append an OUT document to
  // a ledger that cannot delete either one.
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const cached = await checkIdempotency(idempotencyKey);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.statusCode });
    }
  }

  await connectDB();

  const checkinLog = await Log.findOne({
    _id: id,
    sessionToken,
    action: "in",
  });
  if (!checkinLog)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const location = await findOwnedLocationByType(
    checkinLog.locationType as LocationType,
    checkinLog.locationId.toString(),
  );
  const mode = location?.checkInMode ?? "click";
  if (mode === "passkey") {
    return NextResponse.json(
      {
        error: "PASSKEY_REQUIRED",
        message: "This location requires biometric (passkey) check-out.",
      },
      { status: 403 },
    );
  }

  const existing = await Log.findOne({
    teamId: checkinLog.teamId,
    relatedLogId: checkinLog._id,
    action: "out",
  });
  if (existing)
    return NextResponse.json({ already: true, log: existing }, { status: 200 });

  // Append-only: create a new OUT document instead of mutating the check-in
  const checkoutLog = await Log.create({
    teamId: checkinLog.teamId,
    locationId: checkinLog.locationId,
    locationType: checkinLog.locationType,
    sessionToken: checkinLog.sessionToken,
    userId: checkinLog.userId,
    visitorName: checkinLog.visitorName,
    deviceId: checkinLog.deviceId,
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    action: "out",
    relatedLogId: checkinLog._id,
    timestamp: new Date(),
  });

  publishLogCreated(checkoutLog);

  if (idempotencyKey) {
    await saveIdempotency(idempotencyKey, 201, checkoutLog.toObject());
  }

  return NextResponse.json(checkoutLog, { status: 201 });
}

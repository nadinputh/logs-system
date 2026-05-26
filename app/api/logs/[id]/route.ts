import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { Building } from "@/lib/models/Building";
import { Floor } from "@/lib/models/Floor";
import { Room } from "@/lib/models/Room";

export const runtime = "nodejs";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

async function getLocationCheckInMode(
  locationType: string,
  locationId: any,
): Promise<"click" | "passkey"> {
  const model =
    locationType === "room"
      ? Room
      : locationType === "floor"
        ? Floor
        : locationType === "building"
          ? Building
          : null;
  if (!model) return "click";
  const doc: any = await (model as any)
    .findById(locationId)
    .select("checkInMode")
    .lean();
  return (doc?.checkInMode as "click" | "passkey") ?? "click";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const body = await req.json();
  const { sessionToken } = body;

  if (!sessionToken) {
    return NextResponse.json(
      { error: "sessionToken required" },
      { status: 400 },
    );
  }

  await connectDB();

  const checkinLog = await Log.findOne({
    _id: params.id,
    sessionToken,
    action: "in",
  });
  if (!checkinLog)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mode = await getLocationCheckInMode(
    checkinLog.locationType,
    checkinLog.locationId,
  );
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
    relatedLogId: checkinLog._id,
    action: "out",
  });
  if (existing)
    return NextResponse.json({ already: true, log: existing }, { status: 200 });

  // Append-only: create a new OUT document instead of mutating the check-in
  const checkoutLog = await Log.create({
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

  return NextResponse.json(checkoutLog, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { User } from "@/lib/models/User";
import { verifySessionQrToken } from "@/lib/jwt";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { publishLogCreated } from "@/lib/realtime/logEvents";
import { getClientIp } from "@/lib/server/getClientIp";
import { assertSameOrigin } from "@/lib/csrf";
import { acquireCheckInLock } from "@/lib/checkInLock";
import { claim } from "@/lib/claim";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const body = await req.json();
  const { token, locationId, locationType } = body;

  if (!token || !locationId || !locationType) {
    return NextResponse.json(
      { error: "token, locationId, locationType required" },
      { status: 400 },
    );
  }
  if (!process.env.SESSION_QR_SECRET) {
    return NextResponse.json(
      { error: "SESSION_QR_SECRET not configured" },
      { status: 500 },
    );
  }

  let userId: string;
  let jti: string | undefined;
  try {
    const payload = await verifySessionQrToken(token);
    userId = payload.userId;
    jti = payload.jti;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 },
    );
  }

  await connectDB();

  const location = await findOwnedLocationByType(
    locationType as LocationType,
    locationId,
  );
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  const teamId = location.teamId.toString();

  const auth = await requireTeamPermission("terminal.scan", { teamId });
  if (auth.error) return auth.error;

  const user = await User.findById(userId).lean();
  if (!user)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  const release = await acquireCheckInLock(teamId, locationId, userId);
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
    const lastCheckin = await Log.findOne({
      teamId,
      locationId,
      userId,
      action: "in",
    }).sort({ timestamp: -1 });
    if (lastCheckin) {
      const existingCheckout = await Log.findOne({
        teamId,
        relatedLogId: lastCheckin._id,
        action: "out",
      });
      if (!existingCheckout) {
        return NextResponse.json(
          { existing: true, log: lastCheckin },
          { status: 200 },
        );
      }
    }

    // The 30s QR is one scan: a replay after check-out must not check the user
    // back in. (Checked after the open-visit return so a double scan stays a no-op.)
    if (jti && (await claim(`sessionqr:${jti}`, userId)) !== null) {
      return NextResponse.json(
        { error: "Token already used" },
        { status: 409 },
      );
    }

    const log = await Log.create({
      teamId,
      locationId,
      locationType,
      sessionToken: userId,
      userId,
      visitorName: (user as any).name,
      ipAddress: getClientIp(req),
      userAgent: req.headers.get("user-agent") ?? undefined,
      action: "in",
      timestamp: new Date(),
    });

    publishLogCreated(log);

    return NextResponse.json(log, { status: 201 });
  } finally {
    await release();
  }
}

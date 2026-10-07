import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { assertSameOrigin } from "@/lib/csrf";
import { findOwnedLocationById } from "@/lib/locationOwnership";

export const runtime = "nodejs";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST, not GET: sessionToken is the visitor's bearer credential and must not
// ride in a query string.
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const body = await req.json().catch(() => null);
  const locationId = typeof body?.locationId === "string" ? body.locationId : null;
  const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : null;

  if (!locationId || !sessionToken || !UUID_RE.test(sessionToken)) {
    return NextResponse.json(
      { error: "locationId and sessionToken required" },
      { status: 400 },
    );
  }

  await connectDB();

  const location = await findOwnedLocationById(locationId);
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  const teamId = location.teamId.toString();

  const lastCheckin = await Log.findOne({
    teamId,
    locationId,
    sessionToken,
    action: "in",
  }).sort({ timestamp: -1 });

  if (!lastCheckin) return NextResponse.json({ openLog: null });

  const checkout = await Log.findOne({
    teamId,
    relatedLogId: lastCheckin._id,
    action: "out",
  });
  if (checkout) return NextResponse.json({ openLog: null });

  return NextResponse.json({ openLog: lastCheckin });
}

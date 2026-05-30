import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { findOwnedLocationById } from "@/lib/locationOwnership";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const sessionToken = req.nextUrl.searchParams.get("sessionToken");

  if (!locationId || !sessionToken) {
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

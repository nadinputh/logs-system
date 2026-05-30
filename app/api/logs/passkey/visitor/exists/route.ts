import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionToken = req.nextUrl.searchParams.get("sessionToken");
  const locationId = req.nextUrl.searchParams.get("locationId");
  const locationType = req.nextUrl.searchParams.get("locationType");
  if (!sessionToken || !locationId || !locationType) {
    return NextResponse.json({ exists: false });
  }
  await connectDB();

  const location = await findOwnedLocationByType(
    locationType as LocationType,
    locationId,
  );
  if (!location) {
    return NextResponse.json({ exists: false });
  }

  const cred = await VisitorPasskeyCredential.findOne({
    teamId: location.teamId,
    sessionToken,
  })
    .select("_id")
    .lean();
  return NextResponse.json({ exists: !!cred });
}

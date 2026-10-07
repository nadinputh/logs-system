import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";
import { assertSameOrigin } from "@/lib/csrf";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";

export const runtime = "nodejs";

// POST, not GET: sessionToken is the visitor's bearer credential and must not
// ride in a query string.
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const body = await req.json().catch(() => null);
  const { sessionToken, locationId, locationType } = body ?? {};
  if (
    typeof sessionToken !== "string" ||
    typeof locationId !== "string" ||
    !["building", "floor", "room"].includes(locationType)
  ) {
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

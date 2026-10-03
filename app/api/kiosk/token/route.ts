import { NextRequest, NextResponse } from "next/server";
import { signKioskToken } from "@/lib/jwt";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { findOwnedLocationById } from "@/lib/locationOwnership";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Minting is restricted to the team that owns the location; otherwise anyone
  // who knows a location id could fetch a fresh token from anywhere.
  const auth = await requireTeamPermission("terminal.scan");
  if (auth.error) return auth.error;

  const locationId = req.nextUrl.searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "locationId required" }, { status: 400 });
  }
  if (!process.env.KIOSK_SECRET) {
    return NextResponse.json(
      { error: "KIOSK_SECRET not configured" },
      { status: 500 },
    );
  }
  const location = await findOwnedLocationById(locationId).catch(() => null);
  if (!location || location.teamId.toString() !== auth.teamId) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  const token = await signKioskToken(locationId);
  return NextResponse.json({ token });
}

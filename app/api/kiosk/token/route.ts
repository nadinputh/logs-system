import { NextRequest, NextResponse } from "next/server";
import { signKioskToken } from "@/lib/jwt";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
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
  const token = await signKioskToken(locationId);
  return NextResponse.json({ token });
}

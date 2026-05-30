import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Building } from "@/lib/models/Building";
import { Floor } from "@/lib/models/Floor";
import { requireTeamPermission } from "@/lib/middleware/auth";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeamPermission("locations.read");
  if (auth.error || !auth.teamId) return auth.error;

  const { id } = await params;
  await connectDB();

  const building = await Building.findOne({ _id: id, teamId: auth.teamId })
    .select("_id")
    .lean();
  if (!building) {
    return NextResponse.json({ error: "Building not found" }, { status: 404 });
  }

  const floors = await Floor.find({ buildingId: id, teamId: auth.teamId })
    .sort({ number: 1 })
    .lean();
  return NextResponse.json(floors);
}

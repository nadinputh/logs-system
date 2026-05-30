import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Floor } from "@/lib/models/Floor";
import { Room } from "@/lib/models/Room";
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

  const floor = await Floor.findOne({ _id: id, teamId: auth.teamId })
    .select("_id")
    .lean();
  if (!floor) {
    return NextResponse.json({ error: "Floor not found" }, { status: 404 });
  }

  const rooms = await Room.find({ floorId: id, teamId: auth.teamId })
    .sort({ number: 1 })
    .lean();
  return NextResponse.json(rooms);
}

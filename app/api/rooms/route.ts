import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Room } from "@/lib/models/Room";
import { Floor } from "@/lib/models/Floor";
import { Building } from "@/lib/models/Building";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { CreateRoomSchema } from "@/lib/validations/location";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTeamPermission("locations.read");
  if (auth.error || !auth.teamId) return auth.error;

  await connectDB();
  const rooms = await Room.find({ teamId: auth.teamId })
    .sort({ buildingId: 1, number: 1 })
    .lean();
  return NextResponse.json(rooms);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeamPermission("locations.write");
  if (auth.error || !auth.teamId) return auth.error;

  const body = await req.json();
  const parsed = CreateRoomSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();
  const [floor, building] = await Promise.all([
    Floor.findOne({
      _id: parsed.data.floorId,
      teamId: auth.teamId,
    })
      .select("_id buildingId")
      .lean<any>(),
    Building.findOne({
      _id: parsed.data.buildingId,
      teamId: auth.teamId,
    })
      .select("_id")
      .lean(),
  ]);

  if (!floor) {
    return NextResponse.json(
      { error: "Floor not found in active team" },
      { status: 404 },
    );
  }
  if (!building) {
    return NextResponse.json(
      { error: "Building not found in active team" },
      { status: 404 },
    );
  }
  if (floor.buildingId?.toString() !== parsed.data.buildingId) {
    return NextResponse.json(
      { error: "Floor does not belong to the supplied building" },
      { status: 400 },
    );
  }

  const room = await Room.create({
    ...parsed.data,
    teamId: auth.teamId,
  });
  return NextResponse.json(room, { status: 201 });
}

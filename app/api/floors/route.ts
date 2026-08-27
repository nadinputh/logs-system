import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Floor } from "@/lib/models/Floor";
import { Building } from "@/lib/models/Building";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { CreateFloorSchema } from "@/lib/validations/location";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTeamPermission("locations.read");
  if (auth.error || !auth.teamId) return auth.error;

  await connectDB();
  const floors = await Floor.find({ teamId: auth.teamId })
    .sort({ buildingId: 1, number: 1 })
    .lean();
  return NextResponse.json(floors);
}

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const auth = await requireTeamPermission("locations.write");
  if (auth.error || !auth.teamId) return auth.error;

  const body = await req.json();
  const parsed = CreateFloorSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();
  const building = await Building.findOne({
    _id: parsed.data.buildingId,
    teamId: auth.teamId,
  })
    .select("_id")
    .lean();
  if (!building) {
    return NextResponse.json(
      { error: "Building not found in active team" },
      { status: 404 },
    );
  }

  const floor = await Floor.create({
    ...parsed.data,
    teamId: auth.teamId,
  });
  return NextResponse.json(floor, { status: 201 });
}

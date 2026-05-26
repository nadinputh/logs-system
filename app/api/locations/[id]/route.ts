import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Building } from "@/lib/models/Building";
import { Floor } from "@/lib/models/Floor";
import { Room } from "@/lib/models/Room";
import { requireAuth } from "@/lib/middleware/auth";
import { UpdateLocationModeSchema } from "@/lib/validations/location";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const type = req.nextUrl.searchParams.get("type");
  await connectDB();

  let doc: any = null;
  let locationType: string | null = null;

  if (!type || type === "room") {
    doc = await Room.findById(params.id)
      .populate("floorId")
      .populate("buildingId")
      .lean();
    if (doc) locationType = "room";
  }
  if (!doc && (!type || type === "floor")) {
    doc = await Floor.findById(params.id).populate("buildingId").lean();
    if (doc) locationType = "floor";
  }
  if (!doc && (!type || type === "building")) {
    doc = await Building.findById(params.id).lean();
    if (doc) locationType = "building";
  }

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...doc, locationType });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { error } = await requireAuth("admin");
  if (error) return error;

  const body = await req.json();
  const parsed = UpdateLocationModeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();
  const update = { checkInMode: parsed.data.checkInMode };

  const models = [
    { model: Room, type: "room" as const },
    { model: Floor, type: "floor" as const },
    { model: Building, type: "building" as const },
  ];
  for (const { model, type } of models) {
    const doc = await (model as any)
      .findByIdAndUpdate(params.id, update, { returnDocument: "after" })
      .lean();
    if (doc) return NextResponse.json({ ...doc, locationType: type });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

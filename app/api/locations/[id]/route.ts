import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { Building } from "@/lib/models/Building";
import { Floor } from "@/lib/models/Floor";
import { Room } from "@/lib/models/Room";
import { requireTeamPermission } from "@/lib/middleware/auth";
import {
  UpdateLocationModeSchema,
  UpdateBuildingSchema,
  UpdateFloorSchema,
  UpdateRoomSchema,
  CheckInModeEnum,
} from "@/lib/validations/location";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const LOCATION_MODELS = {
  room: Room,
  floor: Floor,
  building: Building,
} as const;

const METADATA_SCHEMAS = {
  room: UpdateRoomSchema,
  floor: UpdateFloorSchema,
  building: UpdateBuildingSchema,
} as const;

type LocationType = keyof typeof LOCATION_MODELS;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireTeamPermission("locations.read");
  if (auth.error || !auth.teamId) return auth.error;

  const { id } = await params;
  const type = req.nextUrl.searchParams.get("type");
  await connectDB();

  let doc: any = null;
  let locationType: string | null = null;

  if (!type || type === "room") {
    doc = await Room.findOne({ _id: id, teamId: auth.teamId })
      .populate("floorId")
      .populate("buildingId")
      .lean();
    if (doc) locationType = "room";
  }
  if (!doc && (!type || type === "floor")) {
    doc = await Floor.findOne({ _id: id, teamId: auth.teamId })
      .populate("buildingId")
      .lean();
    if (doc) locationType = "floor";
  }
  if (!doc && (!type || type === "building")) {
    doc = await Building.findOne({ _id: id, teamId: auth.teamId }).lean();
    if (doc) locationType = "building";
  }

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ ...doc, locationType });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const { id } = await params;

  const body = await req.json();
  const typeParam = req.nextUrl.searchParams.get("type");
  const type: LocationType | null =
    typeParam === "room" || typeParam === "floor" || typeParam === "building"
      ? typeParam
      : null;
  const isModeChange = typeof body?.checkInMode !== "undefined";

  // Mode changes stay admin-gated (they flip a security control); plain
  // metadata edits only need the same permission that create already uses.
  const auth = await requireTeamPermission(
    isModeChange ? "locations.mode.update" : "locations.write",
  );
  if (auth.error || !auth.teamId) return auth.error;

  await connectDB();

  // A `type` hint lets the caller skip the room→floor→building guesswork
  // below entirely, and is required for metadata edits since each location
  // type has its own field shape (Floor.number is an int, Room.number a
  // string, etc.) — checkInMode is the one field shared by all three, so
  // untyped requests still fall back to the cross-model probe for backward
  // compatibility with any caller that predates the hint.
  if (type) {
    const schema = METADATA_SCHEMAS[type].merge(
      z.object({ checkInMode: CheckInModeEnum.optional() }),
    );
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 },
      );
    }

    const model = LOCATION_MODELS[type];
    const doc = await (model as any)
      .findOneAndUpdate({ _id: id, teamId: auth.teamId }, parsed.data, {
        returnDocument: "after",
      })
      .lean();
    if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...doc, locationType: type });
  }

  if (!isModeChange) {
    return NextResponse.json(
      { error: "type is required to update location details" },
      { status: 400 },
    );
  }

  const parsed = UpdateLocationModeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const update = { checkInMode: parsed.data.checkInMode };
  const models = [
    { model: Room, type: "room" as const },
    { model: Floor, type: "floor" as const },
    { model: Building, type: "building" as const },
  ];
  for (const { model, type } of models) {
    const doc = await (model as any)
      .findOneAndUpdate({ _id: id, teamId: auth.teamId }, update, {
        returnDocument: "after",
      })
      .lean();
    if (doc) return NextResponse.json({ ...doc, locationType: type });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

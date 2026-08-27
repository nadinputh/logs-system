import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Building } from "@/lib/models/Building";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { CreateBuildingSchema } from "@/lib/validations/location";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireTeamPermission("locations.read");
  if (auth.error || !auth.teamId) return auth.error;

  await connectDB();
  const buildings = await Building.find({ teamId: auth.teamId })
    .sort({ name: 1 })
    .lean();
  return NextResponse.json(buildings);
}

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const auth = await requireTeamPermission("locations.write");
  if (auth.error || !auth.teamId || !auth.session?.user) return auth.error;

  const body = await req.json();
  const parsed = CreateBuildingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();
  const building = await Building.create({
    ...parsed.data,
    teamId: auth.teamId,
  });
  return NextResponse.json(building, { status: 201 });
}

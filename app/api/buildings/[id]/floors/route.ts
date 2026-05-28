import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Floor } from "@/lib/models/Floor";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  await connectDB();
  const floors = await Floor.find({ buildingId: id })
    .sort({ number: 1 })
    .lean();
  return NextResponse.json(floors);
}

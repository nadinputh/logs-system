import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { QuestCard } from "@/lib/models/QuestCard";
import { QuestProgress } from "@/lib/models/QuestProgress";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  await connectDB();
  const card = await QuestCard.findOne({
    qrToken: token,
    isActive: true,
  }).lean<any>();
  if (!card)
    return NextResponse.json({ error: "Quest not found" }, { status: 404 });

  const progress = await QuestProgress.findOne({
    teamId: card.teamId,
    questCardId: (card as any)._id,
  }).lean();
  return NextResponse.json({ card, progress: progress ?? null });
}

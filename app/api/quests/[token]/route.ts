import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { QuestCard } from "@/lib/models/QuestCard";
import { QuestProgress } from "@/lib/models/QuestProgress";
import { limitByIp } from "@/lib/rateLimitGuard";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const limited = await limitByIp(req, "quest-card", 60);
  if (limited) return limited;
  const { token } = await params;
  await connectDB();
  // Public: the card token is the only credential. Never hand back who issued it
  // or which team owns it.
  const card = await QuestCard.findOne({
    qrToken: token,
    isActive: true,
  })
    .select("-issuedBy -teamId")
    .lean<any>();
  if (!card)
    return NextResponse.json({ error: "Quest not found" }, { status: 404 });

  // progress.sessionToken / userId identify the first holder and the former is a
  // bearer credential for the check-in APIs: expose step progress only.
  const progress = await QuestProgress.findOne({
    questCardId: (card as any)._id,
  })
    .select("completedSteps completedAt")
    .lean();
  return NextResponse.json({ card, progress: progress ?? null });
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { QuestCard } from "@/lib/models/QuestCard";
import { requireTeamAccess } from "@/lib/middleware/auth";
import { CreateQuestCardSchema } from "@/lib/validations/quest";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { v4 as uuidv4 } from "uuid";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireTeamAccess({ minRole: "manager" });
  if (auth.error || !auth.teamId) return auth.error;

  await connectDB();
  const quests = await QuestCard.find({ teamId: auth.teamId })
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json(quests);
}

export async function POST(req: NextRequest) {
  const auth = await requireTeamAccess({ minRole: "manager" });
  if (auth.error || !auth.teamId || !auth.session?.user) return auth.error;

  const body = await req.json();
  const parsed = CreateQuestCardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();

  const { count, ...cardData } = parsed.data;
  const issuedBy = (auth.session.user as any).id;

  for (const step of cardData.steps) {
    const location = await findOwnedLocationByType(
      step.locationType as LocationType,
      step.locationId,
    );

    if (!location) {
      return NextResponse.json(
        {
          error: `Invalid step location: ${step.locationType}:${step.locationId}`,
        },
        { status: 400 },
      );
    }

    if (location.teamId.toString() !== auth.teamId) {
      return NextResponse.json(
        { error: "Quest steps must belong to your active team" },
        { status: 403 },
      );
    }
  }

  if (cardData.parentQuestId) {
    const parentQuest = await QuestCard.findOne({
      _id: cardData.parentQuestId,
      teamId: auth.teamId,
    })
      .select("_id")
      .lean();

    if (!parentQuest) {
      return NextResponse.json(
        { error: "parentQuestId not found in active team" },
        { status: 400 },
      );
    }
  }

  const cards = await QuestCard.insertMany(
    Array.from({ length: count }, () => ({
      ...cardData,
      teamId: auth.teamId,
      issuedBy,
      qrToken: uuidv4(),
    })),
  );

  return NextResponse.json(cards, { status: 201 });
}

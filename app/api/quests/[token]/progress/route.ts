import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { QuestCard } from "@/lib/models/QuestCard";
import { QuestProgress } from "@/lib/models/QuestProgress";
import { QuestProgressSchema } from "@/lib/validations/quest";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  {
 params }: { params: Promise<{ token: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const { token } = await params;
  const body = await req.json();
  const parsed = QuestProgressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { locationId, locationType, sessionToken } = parsed.data;
  const session = await getServerSession(authOptions);
  await connectDB();

  const card = await QuestCard.findOne({ qrToken: token, isActive: true });
  if (!card)
    return NextResponse.json({ error: "Quest not found" }, { status: 404 });

  const location = await findOwnedLocationByType(
    locationType as LocationType,
    locationId,
  );
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }
  if (location.teamId.toString() !== card.teamId.toString()) {
    return NextResponse.json(
      { error: "Location is not part of this quest's team" },
      { status: 403 },
    );
  }

  let progress = await QuestProgress.findOne({
    teamId: card.teamId,
    questCardId: card._id,
  });
  if (!progress) {
    progress = new QuestProgress({
      teamId: card.teamId,
      questCardId: card._id,
      sessionToken,
      userId: session?.user ? (session.user as any).id : undefined,
      completedSteps: [],
    });
  } else if (!progress.teamId) {
    progress.teamId = card.teamId;
  }

  const alreadyDone = progress.completedSteps.some(
    (s) => s.locationId.toString() === locationId,
  );
  if (alreadyDone) {
    return NextResponse.json(
      { message: "Already recorded", progress },
      { status: 200 },
    );
  }

  if (card.type === "location_chain") {
    const nextStep = card.steps.find(
      (s) => !progress!.completedSteps.some((cs) => cs.stepOrder === s.order),
    );
    if (
      !nextStep ||
      nextStep.locationId.toString() !== locationId ||
      nextStep.locationType !== locationType
    ) {
      return NextResponse.json(
        { error: "Not the next location in sequence" },
        { status: 400 },
      );
    }
    progress.completedSteps.push({
      stepOrder: nextStep.order,
      locationId: nextStep.locationId,
      timestamp: new Date(),
    });
  } else {
    const step = card.steps.find(
      (s) =>
        s.locationId.toString() === locationId &&
        s.locationType === locationType,
    );
    if (!step)
      return NextResponse.json(
        { error: "Location not in this quest" },
        { status: 400 },
      );
    progress.completedSteps.push({
      stepOrder: step.order,
      locationId: step.locationId,
      timestamp: new Date(),
    });
  }

  if (progress.completedSteps.length >= card.steps.length) {
    progress.completedAt = new Date();
  }

  await progress.save();
  return NextResponse.json({ progress, completed: !!progress.completedAt });
}

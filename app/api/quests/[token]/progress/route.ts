import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { QuestCard } from "@/lib/models/QuestCard";
import { QuestProgress } from "@/lib/models/QuestProgress";
import { QuestProgressSchema } from "@/lib/validations/quest";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { assertSameOrigin } from "@/lib/csrf";
import { kioskGate } from "@/lib/kioskGate";
import { clientKey } from "@/lib/rateLimit";
import { rateLimitShared } from "@/lib/rateLimitShared";

export const runtime = "nodejs";

// progress.sessionToken / userId / teamId identify the first holder, and the
// token is a bearer credential for the check-in APIs: never echo them back.
function publicProgress(p: any) {
  return { completedSteps: p.completedSteps, completedAt: p.completedAt };
}

export async function POST(
  req: NextRequest,
  {
 params }: { params: Promise<{ token: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  // Unauthenticated: the card token is the only credential. Bound the rate so
  // a leaked token cannot be driven in a loop.
  const limited = await rateLimitShared(clientKey(req, "quest-progress"), 60, 60_000);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const parsed = QuestProgressSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { locationId, locationType, sessionToken, kioskToken } = parsed.data;
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

  // A step is a visit. A location that demands the live kiosk QR must get the
  // same proof of presence here as it does for check-in; otherwise a quest
  // step can be completed from anywhere with just the card token and the
  // (public) location id.
  const gate = await kioskGate(location, locationId, kioskToken, sessionToken);
  if (gate) return gate;

  const progress: any = await QuestProgress.findOne({
    teamId: card.teamId,
    questCardId: card._id,
  });
  const done: any[] = progress?.completedSteps ?? [];

  if (done.some((s) => s.locationId.toString() === locationId)) {
    return NextResponse.json(
      { message: "Already recorded", progress: publicProgress(progress) },
      { status: 200 },
    );
  }

  let step: any;
  if (card.type === "location_chain") {
    step = card.steps.find((s) => !done.some((cs) => cs.stepOrder === s.order));
    if (
      !step ||
      step.locationId.toString() !== locationId ||
      step.locationType !== locationType
    ) {
      return NextResponse.json(
        { error: "Not the next location in sequence" },
        { status: 400 },
      );
    }
  } else {
    step = card.steps.find(
      (s) =>
        s.locationId.toString() === locationId &&
        s.locationType === locationType,
    );
    if (!step)
      return NextResponse.json(
        { error: "Location not in this quest" },
        { status: 400 },
      );
  }

  // One atomic write per step. The earlier read-modify-write let two concurrent
  // requests both push the same step and reach "complete" without visiting every
  // location; here the filter refuses a step that is already recorded, and the
  // unique questCardId turns a lost insert race into a duplicate-key error.
  let updated: any;
  const writeStep = () =>
    QuestProgress.findOneAndUpdate(
      { questCardId: card._id, "completedSteps.stepOrder": { $ne: step.order } },
      {
        $push: {
          completedSteps: {
            stepOrder: step.order,
            locationId: step.locationId,
            timestamp: new Date(),
          },
        },
        $setOnInsert: {
          teamId: card.teamId,
          sessionToken,
          ...(session?.user ? { userId: (session.user as any).id } : {}),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
  try {
    updated = await writeStep();
  } catch (err: any) {
    if (err?.code !== 11000) throw err;
    // The document now exists (another first visit won the insert). Retry once
    // as a plain push; if it fails again the step really is already recorded.
    try {
      updated = await writeStep();
    } catch (err2: any) {
      if (err2?.code !== 11000) throw err2;
      return NextResponse.json({ message: "Already recorded" }, { status: 200 });
    }
  }

  if (updated.completedSteps.length >= card.steps.length && !updated.completedAt) {
    updated =
      (await QuestProgress.findOneAndUpdate(
        { _id: updated._id, completedAt: { $exists: false } },
        { completedAt: new Date() },
        { returnDocument: "after" },
      )) ?? updated;
  }

  return NextResponse.json({
    progress: publicProgress(updated),
    completed: !!updated.completedAt,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { publishLogCreated } from "@/lib/realtime/logEvents";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await connectDB();

  // 12-hour threshold per CLAUDE.md spec
  const cutoff = new Date(Date.now() - 12 * 60 * 60 * 1000);

  // Find all check-in logs older than 12h
  const staleCheckins = await Log.find({
    teamId: { $exists: true },
    action: "in",
    timestamp: { $lt: cutoff },
  }).lean();

  if (staleCheckins.length === 0) {
    return NextResponse.json({ cleaned: 0 });
  }

  const staleIds = staleCheckins.map((l: any) => l._id);

  // Exclude any that already have a checkout log
  const existingCheckouts = await Log.find({
    relatedLogId: { $in: staleIds },
    action: "out",
  })
    .select("relatedLogId")
    .lean();

  const alreadyClosedSet = new Set(
    existingCheckouts.map((c: any) => c.relatedLogId.toString()),
  );

  const truly_stale = staleCheckins.filter(
    (l: any) => !alreadyClosedSet.has(l._id.toString()),
  );

  if (truly_stale.length === 0) {
    return NextResponse.json({ cleaned: 0 });
  }

  // Append-only: create OUT documents for each stale check-in
  const checkoutLogs = await Log.insertMany(
    truly_stale.map((checkin: any) => ({
      teamId: checkin.teamId,
      locationId: checkin.locationId,
      locationType: checkin.locationType,
      sessionToken: checkin.sessionToken,
      userId: checkin.userId,
      visitorName: checkin.visitorName,
      deviceId: checkin.deviceId,
      action: "out",
      relatedLogId: checkin._id,
      autoCheckedOut: true,
      timestamp: new Date(),
    })),
  );

  checkoutLogs.forEach((log) => publishLogCreated(log));

  return NextResponse.json({ cleaned: truly_stale.length });
}

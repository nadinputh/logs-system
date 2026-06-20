import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { findOwnedLocationById } from "@/lib/locationOwnership";
import { createSseStream, encodeComment, encodeEvent } from "@/lib/realtime/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildLogEvent(log: any) {
  return {
    type: "log.created" as const,
    logId: String(log._id),
    action: log.action as "in" | "out",
    locationId: String(log.locationId),
    locationType: log.locationType,
    relatedLogId: log.relatedLogId ? String(log.relatedLogId) : undefined,
    timestamp:
      log.timestamp instanceof Date
        ? log.timestamp.toISOString()
        : String(log.timestamp),
  };
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const sessionToken = req.nextUrl.searchParams.get("sessionToken");

  if (!locationId || !sessionToken) {
    return NextResponse.json(
      { error: "locationId and sessionToken required" },
      { status: 400 },
    );
  }

  if (!UUID_RE.test(sessionToken)) {
    return NextResponse.json({ error: "Invalid sessionToken" }, { status: 400 });
  }

  await connectDB();

  const location = await findOwnedLocationById(locationId);
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  return createSseStream(req, (send) => {
    let since = new Date();
    send(encodeComment("connected"));

    const heartbeat = setInterval(
      () => send(encodeComment("keep-alive")),
      25_000,
    );

    const poll = async () => {
      const logs = await Log.find({
        locationId,
        sessionToken,
        timestamp: { $gt: since },
      })
        .sort({ timestamp: 1 })
        .lean();

      for (const log of logs) {
        if (log.timestamp > since) since = log.timestamp;
        send(encodeEvent("log.created", buildLogEvent(log)));
      }
    };

    const pollInterval = setInterval(() => {
      poll().catch(() => {});
    }, 3_000);

    return () => {
      clearInterval(heartbeat);
      clearInterval(pollInterval);
    };
  });
}

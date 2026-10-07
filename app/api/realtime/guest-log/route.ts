import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { assertSameOrigin } from "@/lib/csrf";
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

// POST, not GET: sessionToken is the visitor's bearer credential and must not
// ride in a query string. The client reads the stream with fetch (see
// lib/useLogRealtime.ts), since EventSource cannot send a body.
export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const body = await req.json().catch(() => null);
  const locationId = typeof body?.locationId === "string" ? body.locationId : null;
  const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : null;

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

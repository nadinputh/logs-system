import { NextRequest, NextResponse } from "next/server";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { hasMinimumTeamRole } from "@/lib/teamPermissions";
import { TeamRole } from "@/lib/models/TeamMember";
import { connectDB } from "@/lib/db";
import { TeamMember } from "@/lib/models/TeamMember";
import { Log } from "@/lib/models/Log";
import { createSseStream, encodeComment, encodeEvent } from "@/lib/realtime/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

declare global {
  var _staffStreams: Map<string, number> | undefined;
}

export async function GET(req: NextRequest) {
  const auth = await requireTeamPermission("logs.read");
  if (auth.error) return auth.error;
  if (!auth.teamId) {
    return NextResponse.json(
      { error: "No active team selected" },
      { status: 400 },
    );
  }

  await connectDB();

  const teamId = auth.teamId;
  const userId = (auth.session?.user as any)?.id as string | undefined;
  // Team admins/owners stream every member's events; members see only their own.
  const canViewTeam = hasMinimumTeamRole(
    ((auth.membership as any)?.role as TeamRole) ?? "member",
    "admin",
  );

  // Each stream polls MongoDB every 3s: bound how many one member can hold and
  // how long any lives (EventSource reconnects on its own).
  const open = (global._staffStreams ??= new Map<string, number>());
  const mine = userId ?? "anon";
  if ((open.get(mine) ?? 0) >= 5) {
    return NextResponse.json({ error: "Too many open streams" }, { status: 429 });
  }
  open.set(mine, (open.get(mine) ?? 0) + 1);

  return createSseStream(req, (send, close) => {
    let since = new Date();
    send(encodeComment("connected"));

    const heartbeat = setInterval(
      () => send(encodeComment("keep-alive")),
      25_000,
    );

    const poll = async () => {
      const query: Record<string, unknown> = {
        teamId,
        timestamp: { $gt: since },
      };
      if (!canViewTeam && userId) query.userId = userId;

      const logs = await Log.find(query).sort({ timestamp: 1 }).lean();
      for (const log of logs) {
        if (log.timestamp > since) since = log.timestamp;
        send(encodeEvent("log.created", buildLogEvent(log)));
      }
    };

    const pollInterval = setInterval(() => {
      poll().catch(() => {});
    }, 3_000);

    // Access is checked at connect, so a member suspended or removed afterwards
    // would keep receiving events. Re-check every minute and end the stream.
    const accessCheck = setInterval(() => {
      TeamMember.exists({ teamId, userId, status: "active" })
        .then((m) => {
          if (!m) close();
        })
        .catch(() => {});
    }, 60_000);

    return () => {
      clearInterval(heartbeat);
      clearInterval(pollInterval);
      clearInterval(accessCheck);
      const left = (open.get(mine) ?? 1) - 1;
      if (left <= 0) open.delete(mine);
      else open.set(mine, left);
    };
  }, { maxMs: 10 * 60_000 });
}

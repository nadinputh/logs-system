import { NextRequest, NextResponse } from "next/server";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { hasMinimumTeamRole } from "@/lib/teamPermissions";
import { TeamRole } from "@/lib/models/TeamMember";
import { connectDB } from "@/lib/db";
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

  return createSseStream(req, (send) => {
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

    return () => {
      clearInterval(heartbeat);
      clearInterval(pollInterval);
    };
  });
}

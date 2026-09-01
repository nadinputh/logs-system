import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { resolveLocationLabels } from "@/lib/locationLabels";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { hasMinimumTeamRole } from "@/lib/teamPermissions";
import { TeamRole } from "@/lib/models/TeamMember";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

// UTC, not the server process's local timezone — MongoDB's $dateToString
// below has no `timezone` option, so it already groups documents by UTC
// calendar day. Building the day window from *local* calendar components
// (the previous version) meant that on any server whose local timezone
// isn't UTC, a day's check-ins could straddle the UTC day boundary and land
// in a bucket the 7-day loop never generates a slot for — silently
// vanishing from the chart, and separately, the client-computed "today" key
// (also UTC-based) would disagree with this function's local-based one,
// mislabeling today's normal live occupancy as a stuck-log anomaly. One
// canonical basis (UTC) end to end closes both failure modes at once.
function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

// timeZone: "UTC" keeps this label reading the same calendar date as the key
// above regardless of server/viewer timezone — otherwise a negative-offset
// timezone would show the *previous* day's date on a UTC-midnight Date.
function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function countFromAggregate(result: Array<{ count: number }>) {
  return result[0]?.count ?? 0;
}

export async function GET(_req: NextRequest) {
  const auth = await requireTeamPermission("dashboard.read");
  if (auth.error || !auth.session?.user || !auth.teamId) return auth.error;

  await connectDB();

  const userId = (auth.session.user as any).id;
  const teamRole = ((auth.membership as any)?.role as TeamRole) ?? "member";
  // Team admins/owners see workspace-wide metrics; everyone else sees their own.
  const canViewTeam = hasMinimumTeamRole(teamRole, "admin");
  const scopedMatch: Record<string, unknown> = {
    teamId: new Types.ObjectId(auth.teamId),
    action: "in",
  };

  if (!canViewTeam) {
    if (!Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid user" }, { status: 400 });
    }
    scopedMatch.userId = new Types.ObjectId(userId);
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS);
  const weekStart = new Date(todayStart.getTime() - 6 * DAY_MS);
  const monthStart = new Date(todayStart.getTime() - 29 * DAY_MS);
  const logsCollection = Log.collection.name;

  // Every widget left on the dashboard answers "what's happening, and where"
  // — totalToday and currentlyIn (today's volume and live occupancy), daily
  // (the one trend line), and topLocations (where it's concentrated). A
  // prior version also computed an all-time check-in count, an hourly-today
  // breakdown, and a building/floor/room mix; a critique found none of the
  // three were decision-relevant for the admin persona (the all-time count
  // was also silently wrong — see below), so their aggregates were cut along
  // with the widgets that rendered them rather than left to compute unused.
  const [totalToday, openResult, dailyRaw, topLocationsRaw] = await Promise.all([
    Log.countDocuments({
      ...scopedMatch,
      timestamp: { $gte: todayStart, $lt: tomorrowStart },
    }),
    Log.aggregate<{ count: number }>([
      { $match: scopedMatch },
      {
        $lookup: {
          from: logsCollection,
          let: { checkinId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$relatedLogId", "$$checkinId"] },
                    { $eq: ["$action", "out"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "checkoutLogs",
        },
      },
      { $match: { checkoutLogs: { $size: 0 } } },
      { $count: "count" },
    ]),
    Log.aggregate<{ _id: string; count: number; stillOpen: number }>([
      { $match: { ...scopedMatch, timestamp: { $gte: weekStart } } },
      {
        $lookup: {
          from: logsCollection,
          let: { checkinId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$relatedLogId", "$$checkinId"] },
                    { $eq: ["$action", "out"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "checkoutLogs",
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          count: { $sum: 1 },
          // Still-open on a past day (unlike today) means the log outlived
          // the nightly 12h auto-checkout — a stuck record, not a status
          // update. See WeeklyTrendChart's still-open segment on the client.
          stillOpen: {
            $sum: {
              $cond: [{ $eq: [{ $size: "$checkoutLogs" }, 0] }, 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Log.aggregate<{
      _id: { locationType: string; locationId: Types.ObjectId };
      count: number;
      stillIn: number;
    }>([
      { $match: { ...scopedMatch, timestamp: { $gte: monthStart } } },
      {
        $lookup: {
          from: logsCollection,
          let: { checkinId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$relatedLogId", "$$checkinId"] },
                    { $eq: ["$action", "out"] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: "checkoutLogs",
        },
      },
      {
        $group: {
          _id: { locationType: "$locationType", locationId: "$locationId" },
          count: { $sum: 1 },
          stillIn: {
            $sum: {
              $cond: [{ $eq: [{ $size: "$checkoutLogs" }, 0] }, 1, 0],
            },
          },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const dailyMap = new Map(dailyRaw.map((item) => [item._id, item]));
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getTime() + index * DAY_MS);
    const key = formatDateKey(date);
    const entry = dailyMap.get(key);
    return {
      date: key,
      label: formatShortDate(date),
      count: entry?.count ?? 0,
      stillOpen: entry?.stillOpen ?? 0,
    };
  });

  const locationLabels = await resolveLocationLabels(
    topLocationsRaw.map((item) => ({
      locationType: item._id.locationType as "building" | "floor" | "room",
      locationId: item._id.locationId,
    })),
    auth.teamId,
  );

  const topLocations = topLocationsRaw.map((item) => {
    const locationId = item._id.locationId.toString();
    const key = `${item._id.locationType}:${locationId}`;
    const label = locationLabels.get(key);
    return {
      locationId,
      locationType: item._id.locationType,
      name: label?.name ?? "Unknown location",
      path: label?.path ?? null,
      count: item.count,
      stillIn: item.stillIn,
    };
  });

  const currentlyIn = countFromAggregate(openResult);

  return NextResponse.json({
    stats: { totalToday, currentlyIn },
    daily,
    topLocations,
  });
}

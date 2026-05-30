import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { LocationType, resolveLocationLabels } from "@/lib/locationLabels";
import { requireTeamPermission } from "@/lib/middleware/auth";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;
const locationTypes: LocationType[] = ["building", "floor", "room"];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatHour(hour: number) {
  const date = new Date(2000, 0, 1, hour);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });
}

function countFromAggregate(result: Array<{ count: number }>) {
  return result[0]?.count ?? 0;
}

export async function GET(_req: NextRequest) {
  const auth = await requireTeamPermission("dashboard.read");
  if (auth.error || !auth.session?.user || !auth.teamId) return auth.error;

  await connectDB();

  const role = (auth.session.user as any).role;
  const userId = (auth.session.user as any).id;
  const scopedMatch: Record<string, unknown> = {
    teamId: new Types.ObjectId(auth.teamId),
    action: "in",
  };

  if (role !== "admin") {
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

  const [
    totalAll,
    totalToday,
    openResult,
    dailyRaw,
    hourlyRaw,
    typeRaw,
    topLocationsRaw,
  ] = await Promise.all([
    Log.countDocuments(scopedMatch),
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
    Log.aggregate<{ _id: string; count: number }>([
      { $match: { ...scopedMatch, timestamp: { $gte: weekStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Log.aggregate<{ _id: number; count: number }>([
      {
        $match: {
          ...scopedMatch,
          timestamp: { $gte: todayStart, $lt: tomorrowStart },
        },
      },
      { $group: { _id: { $hour: "$timestamp" }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Log.aggregate<{ _id: LocationType; count: number }>([
      { $match: { ...scopedMatch, timestamp: { $gte: monthStart } } },
      { $group: { _id: "$locationType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Log.aggregate<{
      _id: { locationType: LocationType; locationId: Types.ObjectId };
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

  const dailyMap = new Map(dailyRaw.map((item) => [item._id, item.count]));
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart.getTime() + index * DAY_MS);
    const key = formatDateKey(date);
    return {
      date: key,
      label: formatShortDate(date),
      count: dailyMap.get(key) ?? 0,
    };
  });

  const hourlyMap = new Map(hourlyRaw.map((item) => [item._id, item.count]));
  const hourlyToday = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHour(hour),
    count: hourlyMap.get(hour) ?? 0,
  }));

  const typeMap = new Map(typeRaw.map((item) => [item._id, item.count]));
  const locationTypeBreakdown = locationTypes.map((type) => ({
    type,
    label: type[0].toUpperCase() + type.slice(1),
    count: typeMap.get(type) ?? 0,
  }));

  const locationLabels = await resolveLocationLabels(
    topLocationsRaw.map((item) => ({
      locationType: item._id.locationType,
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
    stats: {
      totalToday,
      currentlyIn,
      totalAll,
      checkedOut: Math.max(0, totalAll - currentlyIn),
    },
    daily,
    hourlyToday,
    locationTypeBreakdown,
    topLocations,
  });
}

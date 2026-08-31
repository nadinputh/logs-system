import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { AuditLog } from "@/lib/models/AuditLog";
import { User } from "@/lib/models/User";
import { TeamMember } from "@/lib/models/TeamMember";
import { CreateLogSchema } from "@/lib/validations/log";
import { checkIdempotency, saveIdempotency } from "@/lib/idempotency";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { resolveLocationLabels } from "@/lib/locationLabels";
import { publishLogCreated } from "@/lib/realtime/logEvents";
import { getClientIp } from "@/lib/server/getClientIp";
import {
  requireTeamAccess,
  requireTeamPermission,
} from "@/lib/middleware/auth";
import { hasMinimumTeamRole } from "@/lib/teamPermissions";
import { TeamRole } from "@/lib/models/TeamMember";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

// Escapes regex metacharacters in a user-supplied search string before it
// reaches a Mongo $regex — otherwise a visitor name like "a.*" is a regex,
// not a literal substring, and can degrade into a ReDoS on crafted input.
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(req: NextRequest) {
  const auth = await requireTeamPermission("logs.read");
  if (auth.error) return auth.error;
  if (!auth.session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.teamId) {
    return NextResponse.json(
      { error: "No active team selected" },
      { status: 400 },
    );
  }

  const userId = (auth.session.user as any).id;
  // Team admins/owners see the whole team's check-ins by default; members
  // always see only their own. `scope=mine` overrides that for an admin too —
  // "My Logs" and "All Logs" both call this route, and without this param an
  // admin's "My Logs" silently rendered the entire team's data under a header
  // that said otherwise.
  const mineOnly = req.nextUrl.searchParams.get("scope") === "mine";
  const canViewTeam =
    !mineOnly &&
    hasMinimumTeamRole(
      ((auth.membership as any)?.role as TeamRole) ?? "member",
      "admin",
    );

  const baseQuery = canViewTeam
    ? { teamId: auth.teamId, action: "in" as const }
    : { teamId: auth.teamId, userId, action: "in" as const };

  // distinctLocations is scoped to baseQuery only (role scope), never to the
  // filters below — the dropdown should always list every location this
  // viewer can filter by, not just the ones matching what they've already
  // typed, or its own options would shift under the user as they filter.
  //
  // Unlike .find(), .aggregate()'s $match does no schema-based casting: the
  // string ids from requireTeamPermission must become real ObjectIds here or
  // this silently matches nothing against the ObjectId-typed teamId/userId
  // fields, and distinctLocations comes back empty with no error at all.
  const aggregateMatch: Record<string, unknown> = {
    ...baseQuery,
    teamId: new Types.ObjectId(auth.teamId),
  };
  if ("userId" in aggregateMatch) {
    aggregateMatch.userId = new Types.ObjectId(userId);
  }
  const distinctLocationRefs = await Log.aggregate([
    { $match: aggregateMatch },
    { $group: { _id: { locationType: "$locationType", locationId: "$locationId" } } },
  ]);
  const distinctLocationLabels = await resolveLocationLabels(
    distinctLocationRefs.map((r) => ({
      locationType: r._id.locationType,
      locationId: r._id.locationId,
    })),
    auth.teamId,
  );
  const distinctLocations = distinctLocationRefs
    .map((r) => {
      const key = `${r._id.locationType}:${r._id.locationId.toString()}`;
      const label = distinctLocationLabels.get(key);
      return {
        id: r._id.locationId.toString(),
        label: label?.path ?? label?.name ?? r._id.locationId.toString(),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const query: Record<string, unknown> = { ...baseQuery };

  const search = req.nextUrl.searchParams.get("search");
  if (search) {
    query.visitorName = { $regex: escapeRegex(search), $options: "i" };
  }

  const locationId = req.nextUrl.searchParams.get("locationId");
  if (locationId) {
    query.locationId = locationId;
  }

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  if (from || to) {
    const timestamp: Record<string, Date> = {};
    if (from) timestamp.$gte = new Date(`${from}T00:00:00`);
    if (to) timestamp.$lte = new Date(`${to}T23:59:59.999`);
    query.timestamp = timestamp;
  }

  // "in" / "out" isn't a field on the check-in document itself — it's
  // whether a paired action:"out" Log exists for it. distinct() finds every
  // check-in id that already has a checkout, then $in/$nin on _id filters by
  // that, without rewriting this route onto an aggregation pipeline.
  const status = req.nextUrl.searchParams.get("status");
  if (status === "in" || status === "out") {
    const checkedOutIds = await Log.distinct("relatedLogId", {
      teamId: auth.teamId,
      action: "out",
      relatedLogId: { $ne: null },
    });
    query._id = status === "in" ? { $nin: checkedOutIds } : { $in: checkedOutIds };
  }

  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1");
  // Paginated table view stays at 50/page; a caller that needs every
  // matching row for export (see /settings/team's own CSV export) can raise
  // this up to the same 5000-row ceiling used there.
  const limit = Math.min(
    Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10) || 50, 1),
    5000,
  );

  const [logs, total] = await Promise.all([
    Log.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Log.countDocuments(query),
  ]);

  const checkinIds = logs.map((l: any) => l._id);
  const checkouts = await Log.find({
    teamId: auth.teamId,
    relatedLogId: { $in: checkinIds },
    action: "out",
  })
    .select("relatedLogId timestamp autoCheckedOut")
    .lean();

  const checkoutMap = new Map(
    checkouts.map((c: any) => [c.relatedLogId.toString(), c]),
  );

  const locationLabels = await resolveLocationLabels(
    logs.map((l: any) => ({
      locationType: l.locationType,
      locationId: l.locationId,
    })),
    auth.teamId,
  );

  // A correction (manual checkout, or a field fix via POST .../correction) is
  // keyed to whichever Log document it touched — the check-in or its paired
  // checkout — so both ids need to be in scope, not just the check-in's.
  const checkoutIds = checkouts.map((c: any) => c._id);
  const auditEntries = await AuditLog.find({
    teamId: auth.teamId,
    logId: { $in: [...checkinIds, ...checkoutIds] },
  })
    .sort({ timestamp: 1 })
    .populate("modifiedByUserId", "name email")
    .lean();

  const auditByLogId = new Map<string, any[]>();
  for (const entry of auditEntries) {
    const key = entry.logId.toString();
    const list = auditByLogId.get(key) ?? [];
    list.push({
      field: entry.field,
      originalValue: entry.originalValue,
      newValue: entry.newValue,
      reasonForChange: entry.reasonForChange,
      timestamp: entry.timestamp,
      modifiedByName: (entry.modifiedByUserId as any)?.name ?? (entry.modifiedByUserId as any)?.email ?? null,
    });
    auditByLogId.set(key, list);
  }

  const enriched = logs.map((l: any) => {
    const checkout = checkoutMap.get(l._id.toString()) ?? null;
    const label = locationLabels.get(
      `${l.locationType}:${l.locationId.toString()}`,
    );
    const corrections = [
      ...(auditByLogId.get(l._id.toString()) ?? []),
      ...(checkout ? auditByLogId.get(checkout._id.toString()) ?? [] : []),
    ];
    return {
      ...l,
      checkoutLog: checkout,
      checkoutAt: checkout?.timestamp ?? undefined,
      locationName: label?.name ?? null,
      locationPath: label?.path ?? null,
      corrections,
    };
  });

  return NextResponse.json({
    logs: enriched,
    total,
    page,
    pages: Math.ceil(total / limit),
    distinctLocations,
  });
}

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const body = await req.json();
  const parsed = CreateLogSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Idempotency: if client supplies a key and we've seen it, replay the cached response
  const idempotencyKey = req.headers.get("idempotency-key");
  if (idempotencyKey) {
    const cached = await checkIdempotency(idempotencyKey);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.statusCode });
    }
  }

  await connectDB();

  const {
    locationId,
    locationType,
    sessionToken,
    visitorName,
    visitorEmail,
    visitorPhone,
    visitorGender,
    visitPurpose,
    photo,
    questCardId,
    deviceId,
    geofenceStatus,
  } = parsed.data;

  const location = await findOwnedLocationByType(
    locationType as LocationType,
    locationId,
  );
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const teamId = location.teamId.toString();

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  // Enforce per-location passkey policy
  const mode = location.checkInMode ?? "click";
  if (mode === "passkey") {
    return NextResponse.json(
      {
        error: "PASSKEY_REQUIRED",
        message: "This location requires biometric (passkey) check-in.",
      },
      { status: 403 },
    );
  }

  const auth = await requireTeamPermission("logs.write", { teamId });
  const actorSession = auth.session?.user ? auth.session : null;
  if (auth.error && actorSession) return auth.error;

  const actorUserId = actorSession ? (actorSession.user as any).id : undefined;
  if (actorUserId) {
    const membership = await TeamMember.findOne({
      teamId,
      userId: actorUserId,
      status: "active",
    })
      .select("_id")
      .lean();
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Open check-in detection (append-only model)
  const lastCheckin = await Log.findOne({
    teamId,
    locationId,
    locationType,
    sessionToken,
    action: "in",
  }).sort({ timestamp: -1 });

  if (lastCheckin) {
    const existingCheckout = await Log.findOne({
      teamId,
      relatedLogId: lastCheckin._id,
      action: "out",
    });
    if (!existingCheckout) {
      return NextResponse.json(
        { existing: true, log: lastCheckin },
        { status: 200 },
      );
    }
  }

  const log = await Log.create({
    teamId,
    locationId,
    locationType,
    sessionToken,
    visitorName: visitorName ?? undefined,
    visitorEmail: visitorEmail ?? undefined,
    visitorPhone: visitorPhone ?? undefined,
    visitorGender: visitorGender ?? undefined,
    visitPurpose: visitPurpose ?? undefined,
    userId: actorUserId ?? undefined,
    deviceId: deviceId ?? undefined,
    ipAddress,
    userAgent,
    geofenceStatus: geofenceStatus ?? undefined,
    photo: photo ?? undefined,
    questCardId: questCardId ?? undefined,
    action: "in",
    timestamp: new Date(),
  });

  publishLogCreated(log);

  if (idempotencyKey) {
    await saveIdempotency(idempotencyKey, 201, log.toObject());
  }

  return NextResponse.json(log, { status: 201 });
}

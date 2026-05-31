import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { TeamMember } from "@/lib/models/TeamMember";
import { CreateLogSchema } from "@/lib/validations/log";
import { checkIdempotency, saveIdempotency } from "@/lib/idempotency";
import { findOwnedLocationByType, LocationType } from "@/lib/locationOwnership";
import { resolveLocationLabels } from "@/lib/locationLabels";
import { publishLogCreated } from "@/lib/realtime/logEvents";
import {
  requireTeamAccess,
  requireTeamPermission,
} from "@/lib/middleware/auth";

export const runtime = "nodejs";

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
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
  const role = (auth.session.user as any).role;

  const query =
    role === "admin"
      ? { teamId: auth.teamId, action: "in" as const }
      : { teamId: auth.teamId, userId, action: "in" as const };
  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1");
  const limit = 50;

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

  const enriched = logs.map((l: any) => {
    const checkout = checkoutMap.get(l._id.toString()) ?? null;
    const label = locationLabels.get(
      `${l.locationType}:${l.locationId.toString()}`,
    );
    return {
      ...l,
      checkoutLog: checkout,
      checkoutAt: checkout?.timestamp ?? undefined,
      locationName: label?.name ?? null,
      locationPath: label?.path ?? null,
    };
  });

  return NextResponse.json({
    logs: enriched,
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function POST(req: NextRequest) {
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

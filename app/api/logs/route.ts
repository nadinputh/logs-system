import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { Building } from "@/lib/models/Building";
import { Floor } from "@/lib/models/Floor";
import { Room } from "@/lib/models/Room";
import { CreateLogSchema } from "@/lib/validations/log";
import { checkIdempotency, saveIdempotency } from "@/lib/idempotency";
import { resolveLocationLabels } from "@/lib/locationLabels";

export const runtime = "nodejs";

async function getLocationCheckInMode(
  locationType: string,
  locationId: string,
): Promise<"click" | "passkey"> {
  const model =
    locationType === "room"
      ? Room
      : locationType === "floor"
        ? Floor
        : locationType === "building"
          ? Building
          : null;
  if (!model) return "click";
  const doc: any = await (model as any)
    .findById(locationId)
    .select("checkInMode")
    .lean();
  return (doc?.checkInMode as "click" | "passkey") ?? "click";
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const query =
    role === "admin"
      ? { action: "in" as const }
      : { userId, action: "in" as const };
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

  const session = await getServerSession(authOptions);
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

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent") ?? undefined;

  // Enforce per-location passkey policy
  const mode = await getLocationCheckInMode(locationType, locationId);
  if (mode === "passkey") {
    return NextResponse.json(
      {
        error: "PASSKEY_REQUIRED",
        message: "This location requires biometric (passkey) check-in.",
      },
      { status: 403 },
    );
  }

  // Open check-in detection (append-only model)
  const lastCheckin = await Log.findOne({
    locationId,
    locationType,
    sessionToken,
    action: "in",
  }).sort({ timestamp: -1 });

  if (lastCheckin) {
    const existingCheckout = await Log.findOne({
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
    locationId,
    locationType,
    sessionToken,
    visitorName: visitorName ?? undefined,
    visitorEmail: visitorEmail ?? undefined,
    visitorPhone: visitorPhone ?? undefined,
    visitorGender: visitorGender ?? undefined,
    visitPurpose: visitPurpose ?? undefined,
    userId: session?.user ? (session.user as any).id : undefined,
    deviceId: deviceId ?? undefined,
    ipAddress,
    userAgent,
    geofenceStatus: geofenceStatus ?? undefined,
    photo: photo ?? undefined,
    questCardId: questCardId ?? undefined,
    action: "in",
    timestamp: new Date(),
  });

  if (idempotencyKey) {
    await saveIdempotency(idempotencyKey, 201, log.toObject());
  }

  return NextResponse.json(log, { status: 201 });
}

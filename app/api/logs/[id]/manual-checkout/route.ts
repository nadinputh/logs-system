import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { AuditLog } from "@/lib/models/AuditLog";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { publishLogCreated } from "@/lib/realtime/logEvents";
import { getClientIp } from "@/lib/server/getClientIp";

export const runtime = "nodejs";

const ManualCheckoutSchema = z.object({
  reasonForChange: z.string().min(3).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireTeamPermission("logs.manualCheckout");
  if (auth.error || !auth.session?.user || !auth.teamId) return auth.error;

  const body = await req.json();
  const parsed = ManualCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();

  const checkinLog = await Log.findOne({
    _id: id,
    teamId: auth.teamId,
    action: "in",
  });
  if (!checkinLog) {
    return NextResponse.json(
      { error: "Check-in log not found" },
      { status: 404 },
    );
  }

  const existing = await Log.findOne({
    teamId: auth.teamId,
    relatedLogId: checkinLog._id,
    action: "out",
  });
  if (existing) {
    return NextResponse.json({ already: true, log: existing }, { status: 200 });
  }

  const checkoutLog = await Log.create({
    teamId: checkinLog.teamId,
    locationId: checkinLog.locationId,
    locationType: checkinLog.locationType,
    sessionToken: checkinLog.sessionToken,
    ...(checkinLog.userId && { userId: checkinLog.userId }),
    visitorName: checkinLog.visitorName,
    visitorEmail: checkinLog.visitorEmail,
    visitorPhone: checkinLog.visitorPhone,
    visitorGender: checkinLog.visitorGender,
    visitPurpose: checkinLog.visitPurpose,
    deviceId: checkinLog.deviceId,
    ipAddress: getClientIp(req),
    userAgent: req.headers.get("user-agent") ?? undefined,
    action: "out",
    relatedLogId: checkinLog._id,
    timestamp: new Date(),
  });

  await AuditLog.create({
    teamId: auth.teamId,
    logId: checkinLog._id,
    modifiedByUserId: (auth.session.user as any).id,
    field: "manualCheckout",
    originalValue: "open",
    newValue: checkoutLog._id.toString(),
    reasonForChange: parsed.data.reasonForChange,
    timestamp: new Date(),
  });

  publishLogCreated(checkoutLog);

  return NextResponse.json({ log: checkoutLog }, { status: 201 });
}

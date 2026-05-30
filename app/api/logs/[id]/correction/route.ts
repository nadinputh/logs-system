import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Log } from "@/lib/models/Log";
import { AuditLog } from "@/lib/models/AuditLog";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { z } from "zod";

export const runtime = "nodejs";

const CorrectionSchema = z.object({
  field: z.enum([
    "visitorName",
    "locationId",
    "locationType",
    "timestamp",
    "action",
  ]),
  newValue: z.string().min(1),
  reasonForChange: z.string().min(1).max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireTeamPermission("logs.correct");
  if (auth.error || !auth.session?.user || !auth.teamId) return auth.error;

  const body = await req.json();
  const parsed = CorrectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();

  const log = await Log.findOne({ _id: id, teamId: auth.teamId }).lean();
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { field, newValue, reasonForChange } = parsed.data;
  const originalValue = String((log as any)[field] ?? "");

  if (originalValue === newValue) {
    return NextResponse.json(
      { error: "No change — new value matches existing value" },
      { status: 400 },
    );
  }

  const auditEntry = await AuditLog.create({
    teamId: auth.teamId,
    logId: log._id,
    modifiedByUserId: (auth.session.user as any).id,
    field,
    originalValue,
    newValue,
    reasonForChange,
    timestamp: new Date(),
  });

  console.log("[audit] correction written", auditEntry._id.toString());

  return NextResponse.json(auditEntry, { status: 201 });
}

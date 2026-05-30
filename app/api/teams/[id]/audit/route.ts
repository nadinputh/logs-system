import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { TeamAuditLog } from "@/lib/models/TeamAuditLog";
import { requireTeamPermission } from "@/lib/middleware/auth";

export const runtime = "nodejs";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(5000).default(50),
  action: z
    .enum([
      "member_role_changed",
      "member_status_changed",
      "member_removed",
      "ownership_transferred",
    ])
    .optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  cursor: z.string().optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

function parseDateFilter(value: string, endOfDay: boolean) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(
      `${trimmed}${endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z"}`,
    );
  }

  return new Date(trimmed);
}

function isValidDate(date: Date | null) {
  return !!date && Number.isFinite(date.getTime());
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function encodeCursor(createdAt: Date, id: string) {
  return `${createdAt.getTime()}:${id}`;
}

function parseCursor(value: string) {
  const [timestamp, id] = value.split(":");
  if (!timestamp || !id) return null;

  const millis = Number(timestamp);
  if (!Number.isFinite(millis)) return null;

  const createdAt = new Date(millis);
  if (!Number.isFinite(createdAt.getTime())) return null;
  if (!Types.ObjectId.isValid(id)) return null;

  return { createdAt, id };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const auth = await requireTeamPermission("team.audit.read", { teamId: id });
  if (auth.error || !auth.teamId) return auth.error;

  const parsed = QuerySchema.safeParse({
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    action: req.nextUrl.searchParams.get("action") ?? undefined,
    from: req.nextUrl.searchParams.get("from") ?? undefined,
    to: req.nextUrl.searchParams.get("to") ?? undefined,
    cursor: req.nextUrl.searchParams.get("cursor") ?? undefined,
    format: req.nextUrl.searchParams.get("format") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();

  const fromDate = parsed.data.from
    ? parseDateFilter(parsed.data.from, false)
    : null;
  const toDate = parsed.data.to ? parseDateFilter(parsed.data.to, true) : null;

  if (parsed.data.from && !isValidDate(fromDate)) {
    return NextResponse.json({ error: "Invalid from date" }, { status: 400 });
  }
  if (parsed.data.to && !isValidDate(toDate)) {
    return NextResponse.json({ error: "Invalid to date" }, { status: 400 });
  }
  if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
    return NextResponse.json(
      { error: "from must be before or equal to to" },
      { status: 400 },
    );
  }

  const cursor = parsed.data.cursor ? parseCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !cursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const query: Record<string, unknown> = {
    teamId: auth.teamId,
  };

  if (parsed.data.action) {
    query.action = parsed.data.action;
  }

  if (fromDate || toDate) {
    query.createdAt = {
      ...(fromDate ? { $gte: fromDate } : {}),
      ...(toDate ? { $lte: toDate } : {}),
    };
  }

  if (cursor) {
    query.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      {
        createdAt: cursor.createdAt,
        _id: { $lt: new Types.ObjectId(cursor.id) },
      },
    ];
  }

  const fetchLimit =
    parsed.data.format === "json" ? parsed.data.limit + 1 : parsed.data.limit;

  const auditRows = await TeamAuditLog.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(fetchLimit)
    .lean<any[]>();

  const hasMore =
    parsed.data.format === "json" && auditRows.length > parsed.data.limit;
  const pageRows = hasMore ? auditRows.slice(0, parsed.data.limit) : auditRows;

  const userIds = Array.from(
    new Set(
      auditRows
        .flatMap((row) => [row.actorUserId, row.targetUserId])
        .filter(Boolean)
        .map((id) => id.toString()),
    ),
  );

  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select("name email")
        .lean<any[]>()
    : [];

  const userMap = new Map(
    users.map((user) => [
      user._id.toString(),
      {
        id: user._id.toString(),
        name: user.name ?? null,
        email: user.email ?? null,
      },
    ]),
  );

  const events = pageRows.map((row) => {
    const actorId = row.actorUserId?.toString?.() ?? null;
    const targetId = row.targetUserId?.toString?.() ?? null;

    return {
      id: row._id.toString(),
      teamId: row.teamId.toString(),
      action: row.action,
      actor: actorId
        ? (userMap.get(actorId) ?? { id: actorId, name: null, email: null })
        : null,
      target: targetId
        ? (userMap.get(targetId) ?? { id: targetId, name: null, email: null })
        : null,
      metadata: row.metadata ?? null,
      createdAt: row.createdAt,
    };
  });

  if (parsed.data.format === "csv") {
    const header = [
      "createdAt",
      "action",
      "actorName",
      "actorEmail",
      "actorId",
      "targetName",
      "targetEmail",
      "targetId",
      "metadata",
    ];

    const rows = events.map((event) => [
      new Date(event.createdAt).toISOString(),
      event.action,
      event.actor?.name ?? "",
      event.actor?.email ?? "",
      event.actor?.id ?? "",
      event.target?.name ?? "",
      event.target?.email ?? "",
      event.target?.id ?? "",
      event.metadata ? JSON.stringify(event.metadata) : "",
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((column) => csvEscape(column)).join(","))
      .join("\n");

    const exportedAt = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="team-audit-${auth.teamId}-${exportedAt}.csv"`,
      },
    });
  }

  const lastRow = events.length ? events[events.length - 1] : null;
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor(new Date(lastRow.createdAt), lastRow.id)
      : null;

  return NextResponse.json({
    events,
    nextCursor,
    hasMore,
  });
}

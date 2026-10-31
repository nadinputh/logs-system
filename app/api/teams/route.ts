import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Team } from "@/lib/models/Team";
import { TeamMember } from "@/lib/models/TeamMember";
import { User } from "@/lib/models/User";
import { requireAuth } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { rateLimitShared } from "@/lib/rateLimitShared";

export const runtime = "nodejs";

const CreateTeamSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
});

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function buildUniqueSlug(base: string): Promise<string> {
  const normalized = slugify(base) || "team";
  if (!(await Team.findOne({ slug: normalized }).select("_id").lean())) return normalized;
  // Taken: a random suffix instead of walking name-2, name-3 ... one query each.
  return `${normalized}-${randomBytes(3).toString("hex")}`;
}

export async function GET() {
  const { error, session } = await requireAuth();
  if (error) return error;

  await connectDB();

  const userId = (session.user as any).id;

  if (!Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  const user = await User.findById(userId).select("activeTeamId").lean<any>();
  const activeTeamId = user?.activeTeamId?.toString() ?? null;

  const memberships = await TeamMember.find({ userId, status: "active" })
    .populate("teamId", "name slug ownerUserId createdAt updatedAt")
    .sort({ createdAt: 1 })
    .lean<any[]>();

  const teams = memberships
    .filter((m) => m.teamId)
    .map((m) => {
      const team = m.teamId;
      return {
        id: team._id.toString(),
        name: team.name,
        slug: team.slug,
        ownerUserId: team.ownerUserId?.toString?.() ?? null,
        role: m.role,
        status: m.status,
        isActive: team._id.toString() === activeTeamId,
        canManageMembers: m.role === "owner" || m.role === "admin",
        canManageInvites: m.role === "owner" || m.role === "admin",
      };
    });

  return NextResponse.json({ teams });
}

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { error, session } = await requireAuth();
  if (error) return error;

  const made = await rateLimitShared(`team-create:${(session.user as any).id}`, 5, 60 * 60_000);
  if (!made.ok) {
    return NextResponse.json(
      { error: "Too many teams created. Try again later." },
      { status: 429, headers: { "Retry-After": String(made.retryAfter) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = CreateTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();

  const userId = (session.user as any).id;
  if (!Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ error: "Invalid user" }, { status: 400 });
  }

  const slug = await buildUniqueSlug(parsed.data.slug ?? parsed.data.name);

  // Two requests can pass the slug probe together; the unique index decides.
  // The loser gets one fresh random suffix instead of a 500.
  const make = (s: string) =>
    Team.create({
      name: parsed.data.name,
      slug: s,
      ownerUserId: userId,
      createdByUserId: userId,
    });
  const team = await make(slug).catch((err: any) => {
    if (err?.code !== 11000) throw err;
    return make(`${slug}-${randomBytes(3).toString("hex")}`);
  });

  await TeamMember.create({
    teamId: team._id,
    userId,
    role: "owner",
    status: "active",
    joinedAt: new Date(),
  });

  await User.updateOne({ _id: userId }, { activeTeamId: team._id });

  return NextResponse.json(
    {
      team: {
        id: team._id.toString(),
        name: team.name,
        slug: team.slug,
        role: "owner",
        isActive: true,
      },
    },
    { status: 201 },
  );
}

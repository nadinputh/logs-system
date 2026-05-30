import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { TeamMember } from "@/lib/models/TeamMember";
import { User } from "@/lib/models/User";
import { requireAuth } from "@/lib/middleware/auth";

export const runtime = "nodejs";

const SetActiveTeamSchema = z.object({
  teamId: z.string().min(1),
});

export async function PATCH(req: NextRequest) {
  const { error, session } = await requireAuth();
  if (error || !session?.user) return error;

  const body = await req.json();
  const parsed = SetActiveTeamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const userId = (session.user as any).id;
  const { teamId } = parsed.data;

  if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(teamId)) {
    return NextResponse.json(
      { error: "Invalid team selection" },
      { status: 400 },
    );
  }

  await connectDB();

  const membership = await TeamMember.findOne({
    teamId,
    userId,
    status: "active",
  })
    .select("_id")
    .lean();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await User.updateOne({ _id: userId }, { activeTeamId: teamId });

  return NextResponse.json({ ok: true, activeTeamId: teamId });
}

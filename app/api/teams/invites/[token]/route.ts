import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { TeamInvite } from "@/lib/models/TeamInvite";
import { hashToken } from "@/lib/verification";
import { User } from "@/lib/models/User";

export const runtime = "nodejs";

// Public: returns just enough for the invite landing page to render and branch
// between "create account" and "sign in to accept".
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  await connectDB();

  const invite = await TeamInvite.findOne({
    // Only the hash is stored; see lib/models/TeamInvite.ts.
    token: hashToken(token),
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .populate("teamId", "name")
    .lean<any>();

  if (!invite) {
    return NextResponse.json(
      { valid: false, error: "This invite is invalid or has expired." },
      { status: 404 },
    );
  }

  const existingUser = await User.findOne({ email: invite.email })
    .select("_id")
    .lean();

  return NextResponse.json({
    valid: true,
    email: invite.email,
    role: invite.role,
    teamName: invite.teamId?.name ?? "a team",
    hasAccount: !!existingUser,
  });
}

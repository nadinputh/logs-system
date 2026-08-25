import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { Team } from "@/lib/models/Team";
import { TeamMember } from "@/lib/models/TeamMember";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { issueVerificationToken, setPasswordLink } from "@/lib/verification";
import { sendSetPasswordEmail } from "@/lib/email/send";

export const runtime = "nodejs";

const Schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  role: z.enum(["admin", "manager", "member", "auditor"]).default("member"),
});

// Admin/owner provisions an account directly. The user receives a set-password
// link (which also verifies their email); no temporary password is shared.
export async function POST(req: NextRequest) {
  const auth = await requireTeamPermission("team.members.manage");
  if (auth.error || !auth.teamId || !auth.membership) return auth.error;

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Only the owner may mint another team admin.
  if (parsed.data.role === "admin" && auth.membership.role !== "owner") {
    return NextResponse.json(
      { error: "Only the team owner can add another admin." },
      { status: 403 },
    );
  }

  const email = parsed.data.email.toLowerCase().trim();
  await connectDB();

  if (await User.findOne({ email }).select("_id").lean()) {
    return NextResponse.json(
      { code: "EMAIL_IN_USE", error: "A user with this email already exists. Invite them instead." },
      { status: 409 },
    );
  }

  const user = await User.create({
    name: parsed.data.name,
    email,
    role: "staff",
    emailVerified: null, // verified when they set their password
    activeTeamId: auth.teamId,
  });

  await TeamMember.create({
    teamId: auth.teamId,
    userId: user._id,
    role: parsed.data.role,
    status: "active",
    joinedAt: new Date(),
  });

  const token = await issueVerificationToken(user._id, email, "set_password");
  const team = await Team.findById(auth.teamId).select("name").lean<any>();
  await sendSetPasswordEmail(email, setPasswordLink(token), team?.name);

  return NextResponse.json(
    {
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: parsed.data.role,
      },
    },
    { status: 201 },
  );
}

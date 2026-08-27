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

const Schema = z.object({ userId: z.string().min(1) });

/**
 * Reissues a set-password link for an admin-provisioned account that never
 * reached one.
 *
 * Before this existed, a member whose link expired — or whose mail never sent —
 * was permanently locked out: sign-in fails with no passwordHash, there is no
 * forgot-password route, and both re-creating the user and inviting them 409.
 * The admin who provisioned the account had no lever at all.
 */
export async function POST(req: NextRequest) {
  const auth = await requireTeamPermission("team.members.manage");
  if (auth.error || !auth.teamId || !auth.membership) {
    // `auth.error` is typed as nullable, so returning it bare can yield `null`
    // where a Response is required. The other routes in this repo share that
    // pattern; this one does not add to it.
    return auth.error ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = Schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await connectDB();

  // Scope to the acting team: managing one team must not let you mint a
  // password link for an account you do not administer.
  const membership = await TeamMember.findOne({
    teamId: auth.teamId,
    userId: parsed.data.userId,
  }).lean<any>();
  if (!membership) {
    return NextResponse.json(
      { error: "That user is not a member of this team." },
      { status: 404 },
    );
  }

  const user = await User.findById(parsed.data.userId).select(
    "email passwordHash",
  );
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Only for accounts still awaiting a password. Anyone with a password already
  // has a working sign-in, and this endpoint is not a password-reset backdoor.
  if (user.passwordHash) {
    return NextResponse.json(
      { error: "That user already has a password set." },
      { status: 409 },
    );
  }

  const { token, expiresAt } = await issueVerificationToken(
    user._id,
    user.email,
    "set_password",
  );
  const setPasswordUrl = setPasswordLink(token);
  const team = await Team.findById(auth.teamId).select("name").lean<any>();

  let emailDelivered = false;
  try {
    emailDelivered = await sendSetPasswordEmail(user.email, setPasswordUrl, {
      teamName: team?.name,
      invitedByName: (auth.session?.user as any)?.name ?? undefined,
      expiresAt,
    });
  } catch (err) {
    console.error("[admin/users] set-password resend failed:", err);
  }

  return NextResponse.json({ emailDelivered, setPasswordUrl, expiresAt });
}

import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/User";
import { bumpSessionsVersion } from "@/lib/auth";
import { PlatformAuditLog } from "@/lib/models/PlatformAuditLog";
import { requireSuperAdmin } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { error, session } = await requireSuperAdmin();
  if (error) return error;

  const { id: userId } = await params;
  if (!Types.ObjectId.isValid(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const disable = body?.disable !== false;

  await connectDB();

  const user = await User.findById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (user.isSuperAdmin && disable) {
    return NextResponse.json(
      { error: "Revoke superadmin first (scripts/grant-superadmin.ts --revoke) before disabling this account." },
      { status: 400 },
    );
  }

  user.isDisabled = disable;
  await user.save();

  // Disabling a login must also end any session already in progress — a
  // disabled account with a still-live JWT could keep using the app until
  // that token's own 14-day expiry.
  if (disable) await bumpSessionsVersion(userId);

  await PlatformAuditLog.create({
    actorUserId: (session!.user as any).id,
    action: disable ? "user_disabled" : "user_enabled",
    targetType: "user",
    targetId: user._id,
  });

  return NextResponse.json({ ok: true, isDisabled: user.isDisabled });
}

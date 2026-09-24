import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { bumpSessionsVersion } from "@/lib/auth";
import { PlatformAuditLog } from "@/lib/models/PlatformAuditLog";
import { requireSuperAdmin } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

/** Reuses the same sessionsVersion mechanism the user's own "sign out other
 *  devices" control uses — this just lets a superadmin trigger it on someone
 *  else's account. Invalidates every live JWT for this user immediately. */
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

  await connectDB();
  await bumpSessionsVersion(userId);

  await PlatformAuditLog.create({
    actorUserId: (session!.user as any).id,
    action: "user_force_signed_out",
    targetType: "user",
    targetId: userId,
  });

  return NextResponse.json({ ok: true });
}

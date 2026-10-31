import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { PasskeyCredential } from "@/lib/models/PasskeyCredential";
import { assertSameOrigin } from "@/lib/csrf";
import { requireRecentSignIn } from "@/lib/server/recentSignIn";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ credentialId: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;
  const { credentialId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!Types.ObjectId.isValid(credentialId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await connectDB();
  const stale = await requireRecentSignIn((session.user as any).sid);
  if (stale) return stale;
  const userId = (session.user as any).id;
  const result = await PasskeyCredential.deleteOne({
    _id: credentialId,
    userId,
  });

  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

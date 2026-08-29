import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { SessionInventory } from "@/lib/models/SessionInventory";

export const runtime = "nodejs";

/**
 * Lists this user's active sessions. Each row is one JWT that has been issued
 * and not yet revoked; the caller's own row is marked `current: true` so the
 * UI can protect it from an accidental single-row revoke.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  const currentJti = (session?.user as any)?.sid as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();
  const rows = await SessionInventory.find({ userId })
    .select("jti createdAt lastSeenAt ipAddress userAgent provider")
    .sort({ createdAt: -1 })
    .lean();
  const sessions = rows.map((r: any) => ({
    id: r._id.toString(),
    jti: r.jti as string,
    createdAt: r.createdAt as Date,
    lastSeenAt: (r.lastSeenAt as Date) ?? (r.createdAt as Date),
    ipAddress: r.ipAddress as string,
    userAgent: r.userAgent as string,
    provider: r.provider as "credentials" | "passkey",
    current: currentJti ? r.jti === currentJti : false,
  }));
  return NextResponse.json({ sessions });
}

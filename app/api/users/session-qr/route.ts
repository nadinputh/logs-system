import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { signSessionQrToken } from "@/lib/jwt";

export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.SESSION_QR_SECRET) {
    return NextResponse.json(
      { error: "SESSION_QR_SECRET not configured" },
      { status: 500 },
    );
  }
  const token = await signSessionQrToken((session.user as any).id);
  return NextResponse.json({ token });
}

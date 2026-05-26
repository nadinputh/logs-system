import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { VisitorPasskeyCredential } from "@/lib/models/VisitorPasskeyCredential";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sessionToken = req.nextUrl.searchParams.get("sessionToken");
  if (!sessionToken) {
    return NextResponse.json({ exists: false });
  }
  await connectDB();
  const cred = await VisitorPasskeyCredential.findOne({ sessionToken })
    .select("_id")
    .lean();
  return NextResponse.json({ exists: !!cred });
}

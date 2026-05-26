import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { PushSubscription } from "@/lib/models/PushSubscription";
import webpush from "web-push";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY ?? "",
    process.env.VAPID_PRIVATE_KEY ?? "",
  );
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { userId, title, message, url } = body;

  if (!userId || !title || !message) {
    return NextResponse.json(
      { error: "userId, title, message required" },
      { status: 400 },
    );
  }

  await connectDB();

  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, reason: "no subscriptions" });
  }

  const payload = JSON.stringify({ title, message, url: url ?? "/" });
  const results = await Promise.allSettled(
    subscriptions.map((sub: any) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
      ),
    ),
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ sent, total: subscriptions.length });
}

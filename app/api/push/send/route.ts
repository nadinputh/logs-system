import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PushSubscription } from "@/lib/models/PushSubscription";
import { TeamMember } from "@/lib/models/TeamMember";
import webpush from "web-push";
import { assertSameOrigin } from "@/lib/csrf";
import { requireTeamPermission } from "@/lib/middleware/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  // Team-scoped, matching every other admin-targets-a-member action in this
  // codebase (e.g. app/api/admin/users). A bare global role==="admin" check
  // let any site admin push to any userId in the system regardless of team.
  const auth = await requireTeamPermission("team.members.manage");
  if (auth.error) return auth.error;

  const body = await req.json();
  const { userId, title, message, url } = body;

  if (!userId || !title || !message) {
    return NextResponse.json(
      { error: "userId, title, message required" },
      { status: 400 },
    );
  }

  await connectDB();

  const targetMembership = await TeamMember.findOne({
    teamId: auth.teamId,
    userId,
    status: "active",
  }).lean();
  if (!targetMembership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
    process.env.VAPID_PUBLIC_KEY ?? "",
    process.env.VAPID_PRIVATE_KEY ?? "",
  );

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

  // The push service tells us when a subscription is gone (expired or the
  // user unsubscribed at the browser level) via 404/410. Left unpruned, a
  // dead subscription is resent to forever, growing the collection and the
  // per-send fan-out for no reachable device.
  const deadEndpoints = results
    .filter(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" &&
        (r.reason?.statusCode === 404 || r.reason?.statusCode === 410),
    )
    .map((r) => r.reason.endpoint)
    .filter(Boolean);
  if (deadEndpoints.length > 0) {
    await PushSubscription.deleteMany({ endpoint: { $in: deadEndpoints } });
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ sent, total: subscriptions.length });
}

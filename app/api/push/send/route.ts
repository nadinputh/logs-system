import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { PushSubscription } from "@/lib/models/PushSubscription";
import { TeamMember } from "@/lib/models/TeamMember";
import webpush from "web-push";
import { assertSameOrigin } from "@/lib/csrf";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { z } from "zod";
import { Types } from "mongoose";

export const runtime = "nodejs";

// userId feeds Mongo filters on both collections: an object here ({"$ne":null})
// would match every subscriber on the platform, not one member of this team.
// `url` is opened on notification click, so it must stay inside the app.
const SendSchema = z.object({
  userId: z.string().refine((v) => Types.ObjectId.isValid(v)),
  title: z.string().min(1).max(100),
  message: z.string().min(1).max(300),
  url: z.string().regex(/^\/(?![/\\])/).max(500).optional(),
});

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  // Team-scoped, matching every other admin-targets-a-member action in this
  // codebase (e.g. app/api/admin/users). A bare global role==="admin" check
  // let any site admin push to any userId in the system regardless of team.
  const auth = await requireTeamPermission("team.members.manage");
  if (auth.error) return auth.error;

  const parsed = SendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "userId, title, message required" },
      { status: 400 },
    );
  }
  const { userId, title, message, url } = parsed.data;

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

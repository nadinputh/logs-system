import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { PushSubscription } from "@/lib/models/PushSubscription";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

// The server POSTs to this URL, so a free-form https endpoint is an SSRF
// primitive. Browsers only ever hand out their vendor's push-service host.
const PUSH_HOSTS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  ".push.services.mozilla.com",
  ".push.apple.com",
  ".notify.windows.com",
];
function isPushServiceUrl(value: string) {
  try {
    const { protocol, hostname, port, username } = new URL(value);
    return (
      protocol === "https:" &&
      !port &&
      !username &&
      PUSH_HOSTS.some((h) =>
        h.startsWith(".") ? hostname.endsWith(h) : hostname === h,
      )
    );
  } catch {
    return false;
  }
}
const MAX_SUBSCRIPTIONS_PER_USER = 10;

const SubscribeSchema = z.object({
  // The server later POSTs to this URL (web-push), so it must be https; browsers
  // only ever hand out https push-service endpoints.
  endpoint: z.string().max(2048).refine(isPushServiceUrl),
  keys: z.object({
    p256dh: z.string().max(200),
    auth: z.string().max(100),
  }),
});

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await connectDB();
  const userId = (session.user as any).id;

  const known = await PushSubscription.exists({ endpoint: parsed.data.endpoint });
  if (
    !known &&
    (await PushSubscription.countDocuments({ userId })) >= MAX_SUBSCRIPTIONS_PER_USER
  ) {
    return NextResponse.json({ error: "Too many subscriptions" }, { status: 429 });
  }

  await PushSubscription.findOneAndUpdate(
    { endpoint: parsed.data.endpoint },
    {
      userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    { upsert: true },
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.endpoint !== "string" || !body.endpoint) {
    return NextResponse.json({ error: "endpoint required" }, { status: 400 });
  }

  await connectDB();
  const userId = (session.user as any).id;
  await PushSubscription.deleteOne({ endpoint: body.endpoint, userId });
  return NextResponse.json({ ok: true });
}

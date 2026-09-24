import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Subscription } from "@/lib/models/Subscription";
import { requireTeamPermission } from "@/lib/middleware/auth";
import { getBillingProvider, isBillingConfigured } from "@/lib/billing/provider";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const APP_ORIGIN = process.env.NEXTAUTH_URL ?? `http://localhost:${process.env.PORT ?? "4000"}`;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { id } = await params;
  const auth = await requireTeamPermission("team.billing.manage", { teamId: id });
  if (auth.error || !auth.teamId) return auth.error;

  if (!isBillingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  await connectDB();

  const subscription = await Subscription.findOne({ teamId: auth.teamId })
    .select("providerCustomerId")
    .lean();
  if (!subscription?.providerCustomerId) {
    return NextResponse.json(
      { error: "No billing account on file yet — start a checkout first." },
      { status: 404 },
    );
  }

  const provider = await getBillingProvider();
  const { url } = await provider.createPortalSession({
    customerId: subscription.providerCustomerId,
    returnUrl: `${APP_ORIGIN}/settings/team`,
  });

  return NextResponse.json({ url });
}

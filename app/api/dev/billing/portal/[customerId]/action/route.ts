import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mockBillingEnabled } from "@/lib/billing/provider";
import { runMockPortalAction } from "@/lib/billing/mockPortal";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const ActionSchema = z.object({
  action: z.enum(["renew_success", "renew_failure", "cancel_at_period_end", "resume", "cancel_now"]),
});

/**
 * Dev-mode-bypass only — see lib/billing/providers/mock.ts. Stands in for
 * the actions available in Stripe's hosted Billing Portal, called from
 * app/dev/billing/portal/[customerId]/page.tsx.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  if (!mockBillingEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { customerId } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid action is required" }, { status: 400 });
  }

  try {
    await runMockPortalAction(customerId, parsed.data.action);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

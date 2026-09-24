import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mockBillingEnabled } from "@/lib/billing/provider";
import { completeMockCheckout, MOCK_CHECKOUT_OUTCOMES } from "@/lib/billing/mockCheckout";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

const CompleteSchema = z.object({ outcome: z.enum(MOCK_CHECKOUT_OUTCOMES) });

/**
 * Dev-mode-bypass only — see lib/billing/providers/mock.ts. Stands in for
 * Stripe's own servers processing a card and redirecting the browser back;
 * called by the client on app/dev/billing/checkout/[token]/page.tsx when a
 * developer picks an outcome button.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  if (!mockBillingEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = CompleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid outcome is required" }, { status: 400 });
  }

  try {
    const result = await completeMockCheckout(token, parsed.data.outcome);
    if (result.declineMessage) {
      return NextResponse.json({ declined: true, message: result.declineMessage });
    }
    return NextResponse.json({ url: result.redirectUrl });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

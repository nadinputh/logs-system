import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { Coupon } from "@/lib/models/Coupon";
import { requireSuperAdmin } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { getBillingProvider } from "@/lib/billing/provider";

export const runtime = "nodejs";

export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  await connectDB();
  const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ coupons });
}

export async function POST(req: NextRequest) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { error, session } = await requireSuperAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const code = (body?.code as string | undefined)?.trim().toUpperCase();
  const type = body?.type as "percent" | "fixed" | undefined;
  const value = Number(body?.value);

  if (!code || !type || !Number.isFinite(value) || value <= 0) {
    return NextResponse.json({ error: "code, type and a positive value are required" }, { status: 400 });
  }
  if (type === "percent" && value > 100) {
    return NextResponse.json({ error: "A percent discount cannot exceed 100" }, { status: 400 });
  }

  await connectDB();

  const existing = await Coupon.findOne({ code }).lean();
  if (existing) {
    return NextResponse.json({ error: `Coupon code "${code}" already exists` }, { status: 409 });
  }

  // Stripe is the enforcement source of truth for a *public* coupon (it has
  // to exist on Stripe's side for Checkout's promo-code field to accept it).
  // A private coupon applied directly by a superadmin doesn't strictly need
  // one, but creating it there too keeps both kinds consistent and gives a
  // private coupon a path to `stripe.subscriptions.update` later. Either way,
  // billing being unconfigured must not block creating the local record —
  // same rationale as the grant route not blocking on an unreachable Stripe.
  let stripeCouponId: string | undefined;
  let syncNote: string | undefined;
  const provider = await getBillingProvider();
  if (provider.isConfigured()) {
    try {
      const result = await provider.createCoupon({
        code,
        type,
        value,
        currency: body?.currency ?? "usd",
      });
      stripeCouponId = result.providerCouponId;
    } catch (err) {
      syncNote = `Could not create this coupon on Stripe (${(err as Error).message}). Saved locally only.`;
    }
  } else {
    syncNote = "Billing is not configured — this coupon was saved locally only, not synced to Stripe.";
  }

  const coupon = await Coupon.create({
    code,
    type,
    value,
    appliesTo: body?.appliesTo ?? "both",
    planIds: Array.isArray(body?.planIds) ? body.planIds : [],
    maxRedemptions: body?.maxRedemptions ?? null,
    expiresAt: body?.expiresAt ? new Date(body.expiresAt) : null,
    isPublic: Boolean(body?.isPublic),
    stripeCouponId,
    createdByUserId: (session!.user as any).id,
  });

  return NextResponse.json({ coupon, syncNote: syncNote ?? null }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { Types } from "mongoose";
import { connectDB } from "@/lib/db";
import { Coupon } from "@/lib/models/Coupon";
import { PlatformAuditLog } from "@/lib/models/PlatformAuditLog";
import { requireSuperAdmin } from "@/lib/middleware/auth";
import { assertSameOrigin } from "@/lib/csrf";
import { getBillingProvider } from "@/lib/billing/provider";

export const runtime = "nodejs";

/** Deactivate only — never delete, so redemption history stays attributable
 *  to a real code even after it stops working. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _csrf = assertSameOrigin(req);
  if (_csrf) return _csrf;

  const { error, session } = await requireSuperAdmin();
  if (error) return error;

  const { id } = await params;
  if (!Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid coupon id" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const deactivate = body?.isActive !== true;

  await connectDB();

  const coupon = await Coupon.findById(id);
  if (!coupon) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  if (deactivate && coupon.stripeCouponId) {
    const provider = await getBillingProvider();
    try {
      await provider.deactivateCoupon(coupon.stripeCouponId);
    } catch {
      // Don't block the local deactivation on Stripe being unreachable — the
      // local isActive:false already stops it from being offered anywhere in
      // this app's own UI, which is the more common case superadmins act on.
    }
  }

  coupon.isActive = !deactivate;
  await coupon.save();

  await PlatformAuditLog.create({
    actorUserId: (session!.user as any).id,
    action: deactivate ? "coupon_deactivated" : "coupon_updated",
    targetType: "coupon",
    targetId: coupon._id,
  });

  return NextResponse.json({ coupon });
}

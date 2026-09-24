import { connectDB } from '@/lib/db'
import { Coupon } from '@/lib/models/Coupon'
import { PromotionsTable } from './PromotionsTable'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function PlatformAdminPromotionsPage() {
  await connectDB()
  const coupons = await Coupon.find({}).sort({ createdAt: -1 }).lean()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Promotions</h1>
        <p className="mt-1 text-sm text-muted">
          Public codes show up in Stripe Checkout&apos;s promo-code field. Private codes are applied
          directly to a team from its detail page and are never shown at checkout.
        </p>
      </div>
      <PromotionsTable
        initialCoupons={coupons.map((c) => ({
          ...c,
          _id: String(c._id),
          planIds: (c.planIds ?? []).map(String),
          expiresAt: c.expiresAt ? c.expiresAt.toISOString() : null,
          createdByUserId: String(c.createdByUserId),
          createdAt: c.createdAt ? c.createdAt.toISOString() : null,
          updatedAt: c.updatedAt ? c.updatedAt.toISOString() : null,
        }))}
      />
    </div>
  )
}

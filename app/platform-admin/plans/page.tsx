import { connectDB } from '@/lib/db'
import { Plan } from '@/lib/models/Plan'
import { PlansTable } from './PlansTable'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function PlatformAdminPlansPage() {
  await connectDB()
  const plans = await Plan.find({}).sort({ priceCents: 1 }).lean()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Plans</h1>
        <p className="mt-1 text-sm text-muted">
          The catalog every team's Subscription points at. Price is fixed once a plan has a live Stripe
          price — create a new plan row to reprice a tier without changing what existing subscribers pay.
        </p>
      </div>
      <PlansTable
        initialPlans={plans.map((p) => ({
          ...p,
          _id: String(p._id),
        }))}
      />
    </div>
  )
}

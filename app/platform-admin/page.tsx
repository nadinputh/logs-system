import { connectDB } from '@/lib/db'
import { Team } from '@/lib/models/Team'
import { Subscription } from '@/lib/models/Subscription'
import { Plan } from '@/lib/models/Plan'
import { Card, CardContent } from '@/components/ui/card'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">{label}</p>
        <p className="tabular mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </CardContent>
    </Card>
  )
}

export default async function PlatformAdminOverviewPage() {
  await connectDB()

  const [teamCount, subs, plans] = await Promise.all([
    Team.countDocuments({}),
    Subscription.find({}).select('status planId provider currentPeriodEnd createdAt').lean(),
    Plan.find({}).select('key billingCycle priceCents').lean(),
  ])

  const priceByPlanId = new Map(plans.map((p) => [String(p._id), p.priceCents]))

  const statusCounts = { active: 0, trialing: 0, past_due: 0, canceled: 0, incomplete: 0 }
  let mrrCents = 0
  for (const sub of subs) {
    if (sub.status in statusCounts) {
      statusCounts[sub.status as keyof typeof statusCounts]++
    }
    if (sub.status === 'active' || sub.status === 'trialing') {
      const priceCents = priceByPlanId.get(String(sub.planId)) ?? 0
      const plan = plans.find((p) => String(p._id) === String(sub.planId))
      // Normalize annual plans to a monthly-equivalent contribution.
      mrrCents += plan?.billingCycle === 'annual' ? priceCents / 12 : priceCents
    }
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const signupsThisWeek = subs.filter((s) => new Date(s.createdAt) >= sevenDaysAgo).length

  const teamsWithoutSubscription = teamCount - subs.length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Overview</h1>
        <p className="mt-1 text-sm text-muted">System-wide billing health, at a glance.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatTile label="Total teams" value={String(teamCount)} />
        <StatTile
          label="MRR"
          value={`$${(mrrCents / 100).toFixed(2)}`}
          hint="Annual plans normalized to monthly"
        />
        <StatTile label="Active" value={String(statusCounts.active)} />
        <StatTile label="Trialing" value={String(statusCounts.trialing)} />
        <StatTile
          label="Past due"
          value={String(statusCounts.past_due)}
          hint={statusCounts.past_due > 0 ? '7-day grace before read-only' : undefined}
        />
        <StatTile label="Canceled" value={String(statusCounts.canceled)} />
        <StatTile label="Subscriptions created this week" value={String(signupsThisWeek)} />
        <StatTile
          label="Teams with no subscription row"
          value={String(teamsWithoutSubscription)}
          hint={teamsWithoutSubscription > 0 ? 'Run the legacy-plan migration' : undefined}
        />
      </div>
    </div>
  )
}

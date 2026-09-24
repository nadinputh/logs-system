import { notFound } from 'next/navigation'
import { Types } from 'mongoose'
import { connectDB } from '@/lib/db'
import { Team } from '@/lib/models/Team'
import { Subscription } from '@/lib/models/Subscription'
import { Plan } from '@/lib/models/Plan'
import { BillingEvent } from '@/lib/models/BillingEvent'
import { TeamMember } from '@/lib/models/TeamMember'
import { TeamDetailActions } from './TeamDetailActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function PlatformAdminTeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!Types.ObjectId.isValid(id)) notFound()

  await connectDB()

  const team = await Team.findById(id).lean()
  if (!team) notFound()

  const [subscription, memberCount, events, availablePlans] = await Promise.all([
    Subscription.findOne({ teamId: id }).lean(),
    TeamMember.countDocuments({ teamId: id, status: 'active' }),
    BillingEvent.find({ teamId: id }).sort({ timestamp: -1 }).limit(50).lean(),
    Plan.find({ isActive: true }).sort({ priceCents: 1 }).lean(),
  ])

  const planIds = new Set<string>()
  if (subscription?.planId) planIds.add(String(subscription.planId))
  for (const e of events) {
    if (e.fromPlanId) planIds.add(String(e.fromPlanId))
    if (e.toPlanId) planIds.add(String(e.toPlanId))
  }
  const referencedPlans = await Plan.find({ _id: { $in: [...planIds] } })
    .select('name billingCycle')
    .lean()
  const planNameById = new Map(referencedPlans.map((p) => [String(p._id), `${p.name} (${p.billingCycle})`]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">{team.name}</h1>
        <p className="mt-1 text-sm text-muted">
          <span className="font-mono">{team.slug}</span> · {memberCount} active member{memberCount === 1 ? '' : 's'}
        </p>
      </div>

      <TeamDetailActions
        teamId={String(team._id)}
        teamName={team.name}
        platformStatus={team.platformStatus}
        currentPlanName={subscription?.planId ? (planNameById.get(String(subscription.planId)) ?? null) : null}
        subscriptionStatus={subscription?.status ?? null}
        subscriptionProvider={subscription?.provider ?? null}
        grantReason={subscription?.grantReason ?? null}
        grantExpiresAt={subscription?.grantExpiresAt ? String(subscription.grantExpiresAt) : null}
        availablePlans={availablePlans.map((p) => ({
          _id: String(p._id),
          name: p.name,
          billingCycle: p.billingCycle,
        }))}
      />

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-widest text-muted">Billing history</h2>
        <div className="mt-3 space-y-2">
          {events.length === 0 && <p className="text-sm text-muted">No billing events yet.</p>}
          {events.map((e) => (
            <div key={String(e._id)} className="rounded-xl border border-border bg-panel px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-foreground">{e.type.replace(/_/g, ' ')}</span>
                <span className="font-mono text-xs text-muted">{new Date(e.timestamp).toLocaleString()}</span>
              </div>
              {(e.fromPlanId || e.toPlanId) && (
                <p className="mt-1 text-xs text-muted">
                  {e.fromPlanId ? (planNameById.get(String(e.fromPlanId)) ?? 'Unknown plan') : '—'}
                  {' → '}
                  {e.toPlanId ? (planNameById.get(String(e.toPlanId)) ?? 'Unknown plan') : '—'}
                </p>
              )}
              {e.note && <p className="mt-1 text-xs text-muted">{e.note}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

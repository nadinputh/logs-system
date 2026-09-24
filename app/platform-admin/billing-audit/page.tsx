import { connectDB } from '@/lib/db'
import { BillingEvent } from '@/lib/models/BillingEvent'
import { Team } from '@/lib/models/Team'
import { Plan } from '@/lib/models/Plan'
import { User } from '@/lib/models/User'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TYPE_STYLES: Record<string, string> = {
  checkout_completed: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  renewed: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  payment_failed: 'border-danger/30 bg-danger/10 text-danger',
  canceled: 'border-border bg-default text-muted',
  plan_changed: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  comped: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  comp_revoked: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
}

export default async function PlatformAdminBillingAuditPage() {
  await connectDB()

  const events = await BillingEvent.find({}).sort({ timestamp: -1 }).limit(200).lean()

  const teamIds = [...new Set(events.map((e) => String(e.teamId)))]
  const planIds = [...new Set(events.flatMap((e) => [e.fromPlanId, e.toPlanId].filter(Boolean).map(String)))]
  const actorIds = [...new Set(events.map((e) => e.actorUserId).filter(Boolean).map(String))]

  const [teams, plans, actors] = await Promise.all([
    Team.find({ _id: { $in: teamIds } }).select('name').lean(),
    Plan.find({ _id: { $in: planIds } }).select('name billingCycle').lean(),
    User.find({ _id: { $in: actorIds } }).select('name email').lean(),
  ])
  const teamById = new Map(teams.map((t) => [String(t._id), t.name]))
  const planById = new Map(plans.map((p) => [String(p._id), `${p.name} (${p.billingCycle})`]))
  const actorById = new Map(actors.map((a) => [String(a._id), a.name ?? a.email]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Billing audit</h1>
        <p className="mt-1 text-sm text-muted">
          Every checkout, renewal, cancellation, and manual comp across every team — most recent 200 events.
        </p>
      </div>

      <Table aria-label="Billing events">
        <TableHeader>
          <TableHead isRowHeader>Time</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Event</TableHead>
          <TableHead className="hidden md:table-cell">Plan change</TableHead>
          <TableHead className="hidden sm:table-cell">Actor</TableHead>
          <TableHead className="hidden lg:table-cell">Note</TableHead>
        </TableHeader>
        <TableBody>
          {events.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}>
                <p className="py-6 text-center text-sm text-muted">No billing events yet.</p>
              </TableCell>
            </TableRow>
          )}
          {events.map((e) => (
            <TableRow key={String(e._id)}>
              <TableCell className="whitespace-nowrap text-sm text-muted">
                {new Date(e.timestamp).toLocaleString()}
              </TableCell>
              <TableCell className="font-medium text-foreground">
                {teamById.get(String(e.teamId)) ?? 'Unknown team'}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    TYPE_STYLES[e.type] ?? 'border-border bg-default text-muted'
                  }`}
                >
                  {e.type.replace('_', ' ')}
                </span>
              </TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted">
                {e.fromPlanId || e.toPlanId
                  ? `${e.fromPlanId ? planById.get(String(e.fromPlanId)) ?? '—' : '—'} → ${
                      e.toPlanId ? planById.get(String(e.toPlanId)) ?? '—' : '—'
                    }`
                  : '—'}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted">
                {e.actorUserId ? actorById.get(String(e.actorUserId)) ?? 'Unknown' : 'System / webhook'}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-sm text-muted">{e.note ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

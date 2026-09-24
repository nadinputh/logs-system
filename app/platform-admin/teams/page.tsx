import Link from 'next/link'
import { connectDB } from '@/lib/db'
import { Team } from '@/lib/models/Team'
import { Subscription } from '@/lib/models/Subscription'
import { Plan } from '@/lib/models/Plan'
import { TeamMember } from '@/lib/models/TeamMember'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function StatusPill({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-default px-2 py-0.5 text-xs font-semibold text-muted">
        No subscription
      </span>
    )
  }
  const styles: Record<string, string> = {
    active: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    trialing: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    past_due: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    canceled: 'border-border bg-default text-muted',
    incomplete: 'border-border bg-default text-muted',
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${styles[status] ?? styles.canceled}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

export default async function PlatformAdminTeamsPage() {
  await connectDB()

  const [teams, subs, plans, memberCounts] = await Promise.all([
    Team.find({}).select('name slug platformStatus createdAt').sort({ createdAt: -1 }).lean(),
    Subscription.find({}).select('teamId planId status').lean(),
    Plan.find({}).select('key name billingCycle').lean(),
    TeamMember.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$teamId', count: { $sum: 1 } } },
    ]),
  ])

  const subByTeam = new Map(subs.map((s) => [String(s.teamId), s]))
  const planById = new Map(plans.map((p) => [String(p._id), p]))
  const memberCountByTeam = new Map(memberCounts.map((m: any) => [String(m._id), m.count]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Teams</h1>
        <p className="mt-1 text-sm text-muted">Every team in the system — plan, status, and member count.</p>
      </div>

      <Table aria-label="Teams">
        <TableHeader>
          <TableHead isRowHeader>Team</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Subscription</TableHead>
          <TableHead className="hidden sm:table-cell">Members</TableHead>
          <TableHead className="hidden md:table-cell">Platform status</TableHead>
        </TableHeader>
        <TableBody>
          {teams.map((team) => {
            const sub = subByTeam.get(String(team._id))
            const plan = sub ? planById.get(String(sub.planId)) : null
            return (
              <TableRow key={String(team._id)}>
                <TableCell>
                  <Link
                    href={`/platform-admin/teams/${team._id}`}
                    className="font-semibold text-foreground hover:underline"
                  >
                    {team.name}
                  </Link>
                  <span className="ml-1.5 font-mono text-xs text-muted">{team.slug}</span>
                </TableCell>
                <TableCell>{plan ? `${plan.name} (${plan.billingCycle})` : '—'}</TableCell>
                <TableCell>
                  <StatusPill status={sub?.status ?? null} />
                </TableCell>
                <TableCell className="hidden sm:table-cell">{memberCountByTeam.get(String(team._id)) ?? 0}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {team.platformStatus === 'suspended' ? (
                    <span className="inline-flex items-center rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                      Suspended
                    </span>
                  ) : (
                    <span className="text-muted">Active</span>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

import { connectDB } from '@/lib/db'
import { AuditLog } from '@/lib/models/AuditLog'
import { TeamAuditLog } from '@/lib/models/TeamAuditLog'
import { PlatformAuditLog } from '@/lib/models/PlatformAuditLog'
import { Team } from '@/lib/models/Team'
import { User } from '@/lib/models/User'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Row = {
  id: string
  timestamp: Date
  source: 'Log correction' | 'Team' | 'Platform'
  teamId: string | null
  actorId: string | null
  description: string
}

const SOURCE_STYLES: Record<Row['source'], string> = {
  'Log correction': 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Team: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  Platform: 'border-danger/30 bg-danger/10 text-danger',
}

function describeTeamAction(action: string) {
  return action.replace(/_/g, ' ')
}

export default async function PlatformAdminSystemAuditPage() {
  await connectDB()

  const [corrections, teamActions, platformActions] = await Promise.all([
    AuditLog.find({}).sort({ timestamp: -1 }).limit(75).lean(),
    TeamAuditLog.find({}).sort({ createdAt: -1 }).limit(75).lean(),
    PlatformAuditLog.find({}).sort({ timestamp: -1 }).limit(75).lean(),
  ])

  const rows: Row[] = [
    ...corrections.map((c) => ({
      id: String(c._id),
      timestamp: c.timestamp,
      source: 'Log correction' as const,
      teamId: String(c.teamId),
      actorId: String(c.modifiedByUserId),
      description: `${c.field}: "${c.originalValue}" → "${c.newValue}" — ${c.reasonForChange}`,
    })),
    ...teamActions.map((t) => ({
      id: String(t._id),
      timestamp: t.createdAt,
      source: 'Team' as const,
      teamId: String(t.teamId),
      actorId: String(t.actorUserId),
      description: describeTeamAction(t.action),
    })),
    ...platformActions.map((p) => ({
      id: String(p._id),
      timestamp: p.timestamp,
      source: 'Platform' as const,
      teamId: null,
      actorId: String(p.actorUserId),
      description: `${p.action.replace(/_/g, ' ')} (${p.targetType} ${String(p.targetId).slice(-6)})`,
    })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  const teamIds = [...new Set(rows.map((r) => r.teamId).filter(Boolean) as string[])]
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean) as string[])]
  const [teams, actors] = await Promise.all([
    Team.find({ _id: { $in: teamIds } }).select('name').lean(),
    User.find({ _id: { $in: actorIds } }).select('name email').lean(),
  ])
  const teamById = new Map(teams.map((t) => [String(t._id), t.name]))
  const actorById = new Map(actors.map((a) => [String(a._id), a.name ?? a.email]))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">System audit</h1>
        <p className="mt-1 text-sm text-muted">
          Log corrections, team-membership changes, and superadmin actions — most recent 75 of each, merged and
          sorted.
        </p>
      </div>

      <Table aria-label="System audit trail">
        <TableHeader>
          <TableHead isRowHeader>Time</TableHead>
          <TableHead>Source</TableHead>
          <TableHead className="hidden sm:table-cell">Team</TableHead>
          <TableHead className="hidden sm:table-cell">Actor</TableHead>
          <TableHead>Detail</TableHead>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5}>
                <p className="py-6 text-center text-sm text-muted">No audit activity yet.</p>
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={`${r.source}-${r.id}`}>
              <TableCell className="whitespace-nowrap text-sm text-muted">
                {new Date(r.timestamp).toLocaleString()}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${SOURCE_STYLES[r.source]}`}
                >
                  {r.source}
                </span>
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted">
                {r.teamId ? teamById.get(r.teamId) ?? 'Unknown team' : '—'}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-sm text-muted">
                {r.actorId ? actorById.get(r.actorId) ?? 'Unknown' : '—'}
              </TableCell>
              <TableCell className="text-sm text-foreground">{r.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

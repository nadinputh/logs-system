'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'

type TeamRole = 'owner' | 'admin' | 'manager' | 'member' | 'auditor'
type TeamStatus = 'active' | 'suspended'

interface TeamSummary {
  id: string
  name: string
  slug: string
  ownerUserId: string | null
  role: TeamRole
  status: string
  isActive: boolean
  canManageMembers: boolean
  canManageInvites: boolean
}

interface TeamMemberRow {
  userId: string
  name: string | null
  email: string | null
  systemRole: string | null
  teamRole: TeamRole
  status: TeamStatus
  joinedAt: string
  isSelf: boolean
}

interface TeamInviteRow {
  id: string
  email: string
  role: Exclude<TeamRole, 'owner'>
  status: 'pending' | 'accepted' | 'revoked'
  expiresAt: string
  token: string
}

type TeamAuditAction =
  | 'member_role_changed'
  | 'member_status_changed'
  | 'member_removed'
  | 'ownership_transferred'

interface TeamAuditActor {
  id: string
  name: string | null
  email: string | null
}

interface TeamAuditEvent {
  id: string
  teamId: string
  action: TeamAuditAction
  actor: TeamAuditActor | null
  target: TeamAuditActor | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface TeamAuditResponse {
  events?: TeamAuditEvent[]
  nextCursor?: string | null
  hasMore?: boolean
}

const ROLE_OPTIONS: Array<{ value: TeamRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
  { value: 'auditor', label: 'Auditor' },
]

const INVITE_ROLE_OPTIONS: Array<{ value: Exclude<TeamRole, 'owner'>; label: string }> = [
  { value: 'admin', label: 'Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
  { value: 'auditor', label: 'Auditor' },
]

const AUDIT_ACTION_OPTIONS: Array<{ value: 'all' | TeamAuditAction; label: string }> = [
  { value: 'all', label: 'All actions' },
  { value: 'member_role_changed', label: 'Member role changed' },
  { value: 'member_status_changed', label: 'Member status changed' },
  { value: 'member_removed', label: 'Member removed' },
  { value: 'ownership_transferred', label: 'Ownership transferred' },
]

function roleBadgeClass(role: TeamRole) {
  switch (role) {
    case 'owner':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'admin':
      return 'bg-cyan-100 text-cyan-800 border-cyan-200'
    case 'manager':
      return 'bg-sky-100 text-sky-800 border-sky-200'
    case 'auditor':
      return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'member':
    default:
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  }
}

function readApiError(payload: any, fallback: string) {
  if (!payload) return fallback
  if (typeof payload.error === 'string') return payload.error
  if (typeof payload.message === 'string') return payload.message
  return fallback
}

function describeAuditAction(action: TeamAuditAction) {
  if (action === 'member_role_changed') return 'Role updated'
  if (action === 'member_status_changed') return 'Status updated'
  if (action === 'member_removed') return 'Member removed'
  return 'Ownership transferred'
}

function displayActor(actor: TeamAuditActor | null) {
  if (!actor) return 'Unknown user'
  return actor.name ?? actor.email ?? actor.id
}

export default function TeamSettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextPath = searchParams.get('next') ?? '/dashboard'
  const { update } = useSession()

  const [teams, setTeams] = useState<TeamSummary[]>([])
  const [members, setMembers] = useState<TeamMemberRow[]>([])
  const [invites, setInvites] = useState<TeamInviteRow[]>([])
  const [auditEvents, setAuditEvents] = useState<TeamAuditEvent[]>([])

  const [loadingTeams, setLoadingTeams] = useState(true)
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [loadingInvites, setLoadingInvites] = useState(false)
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [switchingTeamId, setSwitchingTeamId] = useState<string | null>(null)

  const [newTeamName, setNewTeamName] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<Exclude<TeamRole, 'owner'>>('member')
  const [creatingInvite, setCreatingInvite] = useState(false)

  const [draftRole, setDraftRole] = useState<Record<string, TeamRole>>({})
  const [draftStatus, setDraftStatus] = useState<Record<string, TeamStatus>>({})
  const [savingMemberUserId, setSavingMemberUserId] = useState<string | null>(null)
  const [removingMemberUserId, setRemovingMemberUserId] = useState<string | null>(null)
  const [transferTargetUserId, setTransferTargetUserId] = useState('')
  const [transferringOwnership, setTransferringOwnership] = useState(false)
  const [revokingInviteId, setRevokingInviteId] = useState<string | null>(null)
  const [auditActionFilter, setAuditActionFilter] = useState<'all' | TeamAuditAction>('all')
  const [auditFromDate, setAuditFromDate] = useState('')
  const [auditToDate, setAuditToDate] = useState('')
  const [exportingAuditCsv, setExportingAuditCsv] = useState(false)
  const [auditNextCursor, setAuditNextCursor] = useState<string | null>(null)
  const [loadingMoreAudit, setLoadingMoreAudit] = useState(false)

  const activeTeam = useMemo(
    () => teams.find((team) => team.isActive) ?? teams[0] ?? null,
    [teams],
  )

  const canManageMembers = Boolean(activeTeam?.canManageMembers)
  const canManageInvites = Boolean(activeTeam?.canManageInvites)
  const canViewAudit = canManageMembers
  const isOwner = activeTeam?.role === 'owner'

  const ownershipCandidates = useMemo(
    () =>
      members.filter(
        (member) =>
          member.status === 'active' && !member.isSelf && member.teamRole !== 'owner',
      ),
    [members],
  )

  function buildAuditSearchParams(
    filter: 'all' | TeamAuditAction,
    fromDate = auditFromDate,
    toDate = auditToDate,
    format: 'json' | 'csv' = 'json',
    limit = format === 'csv' ? '5000' : '50',
    cursor?: string,
  ) {
    const search = new URLSearchParams({ limit, format })
    if (filter !== 'all') {
      search.set('action', filter)
    }
    if (fromDate) {
      search.set('from', fromDate)
    }
    if (toDate) {
      search.set('to', toDate)
    }
    if (cursor) {
      search.set('cursor', cursor)
    }
    return search
  }

  async function loadTeams() {
    setLoadingTeams(true)
    try {
      const res = await fetch('/api/teams')
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to load teams'))
      }

      const nextTeams = (payload.teams ?? []) as TeamSummary[]
      setTeams(nextTeams)

      if (!nextTeams.length) {
        setMembers([])
        setInvites([])
        setAuditEvents([])
        setAuditNextCursor(null)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load teams')
    } finally {
      setLoadingTeams(false)
    }
  }

  async function loadMembers(teamId: string) {
    setLoadingMembers(true)
    try {
      const res = await fetch(`/api/teams/${teamId}/members`)
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to load team members'))
      }
      const nextMembers = (payload.members ?? []) as TeamMemberRow[]
      setMembers(nextMembers)
      setDraftRole(
        Object.fromEntries(nextMembers.map((member) => [member.userId, member.teamRole])),
      )
      setDraftStatus(
        Object.fromEntries(nextMembers.map((member) => [member.userId, member.status])),
      )
    } catch (error) {
      setMembers([])
      toast.error(error instanceof Error ? error.message : 'Failed to load team members')
    } finally {
      setLoadingMembers(false)
    }
  }

  async function loadInvites(teamId: string, allowInvites = canManageInvites) {
    if (!allowInvites) {
      setInvites([])
      return
    }

    setLoadingInvites(true)
    try {
      const res = await fetch(`/api/teams/${teamId}/invites`)
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to load invites'))
      }
      setInvites((payload.invites ?? []) as TeamInviteRow[])
    } catch (error) {
      setInvites([])
      toast.error(error instanceof Error ? error.message : 'Failed to load invites')
    } finally {
      setLoadingInvites(false)
    }
  }

  async function loadAudit(
    teamId: string,
    allowAudit = canViewAudit,
    filter: 'all' | TeamAuditAction = auditActionFilter,
    fromDate = auditFromDate,
    toDate = auditToDate,
    append = false,
    cursor: string | null = null,
  ) {
    if (!allowAudit) {
      setAuditEvents([])
      setAuditNextCursor(null)
      return
    }

    if (append) {
      setLoadingMoreAudit(true)
    } else {
      setLoadingAudit(true)
    }
    try {
      const search = buildAuditSearchParams(
        filter,
        fromDate,
        toDate,
        'json',
        '50',
        cursor ?? undefined,
      )

      const res = await fetch(`/api/teams/${teamId}/audit?${search.toString()}`)
      const payload = (await res.json()) as TeamAuditResponse
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to load team audit events'))
      }

      const nextEvents = (payload.events ?? []) as TeamAuditEvent[]
      setAuditEvents((current) => (append ? [...current, ...nextEvents] : nextEvents))
      setAuditNextCursor(payload.nextCursor ?? null)
    } catch (error) {
      if (!append) {
        setAuditEvents([])
        setAuditNextCursor(null)
      }
      toast.error(error instanceof Error ? error.message : 'Failed to load team audit events')
    } finally {
      if (append) {
        setLoadingMoreAudit(false)
      } else {
        setLoadingAudit(false)
      }
    }
  }

  async function loadMoreAudit() {
    if (!activeTeam || !canViewAudit || !auditNextCursor || loadingMoreAudit) return
    await loadAudit(
      activeTeam.id,
      canViewAudit,
      auditActionFilter,
      auditFromDate,
      auditToDate,
      true,
      auditNextCursor,
    )
  }

  async function switchTeam(teamId: string) {
    if (!teamId || teamId === activeTeam?.id) return

    setSwitchingTeamId(teamId)
    try {
      const targetTeam = teams.find((team) => team.id === teamId) ?? null
      const res = await fetch('/api/teams/active', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to switch team'))
      }

      setTeams((current) =>
        current.map((team) => ({ ...team, isActive: team.id === teamId })),
      )

      try {
        await update?.({ activeTeamId: teamId } as any)
      } catch {
        // Session token refresh is best effort.
      }

      await Promise.all([
        loadMembers(teamId),
        loadInvites(teamId, Boolean(targetTeam?.canManageInvites)),
        loadAudit(
          teamId,
          Boolean(targetTeam?.canManageMembers),
          auditActionFilter,
          auditFromDate,
          auditToDate,
        ),
      ])
      toast.success('Active team updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to switch team')
    } finally {
      setSwitchingTeamId(null)
    }
  }

  async function createTeam(e: React.FormEvent) {
    e.preventDefault()
    if (!newTeamName.trim()) return

    setCreatingTeam(true)
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim() }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to create team'))
      }

      setNewTeamName('')
      await loadTeams()
      toast.success('Team created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create team')
    } finally {
      setCreatingTeam(false)
    }
  }

  async function saveMember(member: TeamMemberRow) {
    if (!activeTeam) return

    const nextRole = draftRole[member.userId] ?? member.teamRole
    const nextStatus = draftStatus[member.userId] ?? member.status

    setSavingMemberUserId(member.userId)
    try {
      const res = await fetch(`/api/teams/${activeTeam.id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: member.userId,
          role: nextRole,
          status: nextStatus,
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to update member'))
      }

      setMembers((current) =>
        current.map((row) =>
          row.userId === member.userId
            ? { ...row, teamRole: nextRole, status: nextStatus }
            : row,
        ),
      )
      toast.success('Member updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update member')
    } finally {
      setSavingMemberUserId(null)
    }
  }

  async function removeMember(member: TeamMemberRow) {
    if (!activeTeam) return

    setRemovingMemberUserId(member.userId)
    try {
      const res = await fetch(`/api/teams/${activeTeam.id}/members`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.userId, remove: true }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to remove member'))
      }

      setMembers((current) => current.filter((row) => row.userId !== member.userId))
      toast.success('Member removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove member')
    } finally {
      setRemovingMemberUserId(null)
    }
  }

  async function createInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!activeTeam || !inviteEmail.trim()) return

    setCreatingInvite(true)
    try {
      const res = await fetch(`/api/teams/${activeTeam.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to send invite'))
      }

      setInviteEmail('')
      setInviteRole('member')
      await loadInvites(activeTeam.id)
      toast.success('Invite created')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send invite')
    } finally {
      setCreatingInvite(false)
    }
  }

  async function revokeInvite(inviteId: string) {
    if (!activeTeam) return

    setRevokingInviteId(inviteId)
    try {
      const res = await fetch(`/api/teams/${activeTeam.id}/invites`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to revoke invite'))
      }

      setInvites((current) => current.filter((invite) => invite.id !== inviteId))
      toast.success('Invite revoked')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to revoke invite')
    } finally {
      setRevokingInviteId(null)
    }
  }

  async function exportAuditCsv() {
    if (!activeTeam || !canViewAudit) return

    setExportingAuditCsv(true)
    try {
      const search = buildAuditSearchParams(
        auditActionFilter,
        auditFromDate,
        auditToDate,
        'csv',
        '5000',
      )

      const res = await fetch(`/api/teams/${activeTeam.id}/audit?${search.toString()}`)
      if (!res.ok) {
        const contentType = res.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          const payload = await res.json()
          throw new Error(readApiError(payload, 'Failed to export audit CSV'))
        }
        throw new Error('Failed to export audit CSV')
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      const disposition = res.headers.get('content-disposition') ?? ''
      const matchedFileName = disposition.match(/filename="?([^";]+)"?/i)?.[1]
      link.href = url
      link.download = matchedFileName ?? 'team-audit.csv'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      toast.success('Audit CSV exported')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to export audit CSV')
    } finally {
      setExportingAuditCsv(false)
    }
  }

  async function transferOwnership(e: React.FormEvent) {
    e.preventDefault()
    if (!activeTeam || !transferTargetUserId) return

    const targetMember = ownershipCandidates.find(
      (member) => member.userId === transferTargetUserId,
    )
    const targetLabel = targetMember?.name ?? targetMember?.email ?? 'selected member'
    const confirmed = window.confirm(
      `Transfer ownership of ${activeTeam.name} to ${targetLabel}? This action demotes your owner role to admin.`,
    )
    if (!confirmed) return

    setTransferringOwnership(true)
    try {
      const res = await fetch(`/api/teams/${activeTeam.id}/ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: transferTargetUserId,
          demoteCurrentOwnerRole: 'admin',
        }),
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(readApiError(payload, 'Failed to transfer ownership'))
      }

      setTransferTargetUserId('')
      await Promise.all([
        loadTeams(),
        loadMembers(activeTeam.id),
        loadInvites(activeTeam.id),
        loadAudit(activeTeam.id, true, auditActionFilter, auditFromDate, auditToDate),
      ])
      toast.success('Ownership transferred')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to transfer ownership')
    } finally {
      setTransferringOwnership(false)
    }
  }

  useEffect(() => {
    void loadTeams()
  }, [])

  useEffect(() => {
    if (!activeTeam) return
    void loadMembers(activeTeam.id)
  }, [activeTeam?.id])

  useEffect(() => {
    if (!activeTeam) return
    void loadInvites(activeTeam.id, canManageInvites)
  }, [activeTeam?.id, canManageInvites])

  useEffect(() => {
    if (!activeTeam) return
    void loadAudit(activeTeam.id, canViewAudit, auditActionFilter, auditFromDate, auditToDate)
  }, [activeTeam?.id, canViewAudit, auditActionFilter, auditFromDate, auditToDate])

  useEffect(() => {
    if (!isOwner) {
      setTransferTargetUserId('')
      return
    }

    if (!ownershipCandidates.length) {
      setTransferTargetUserId('')
      return
    }

    setTransferTargetUserId((current) => {
      if (current && ownershipCandidates.some((member) => member.userId === current)) {
        return current
      }
      return ownershipCandidates[0].userId
    })
  }, [isOwner, ownershipCandidates])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Team & Access</h1>
        <p className="text-sm text-muted-foreground">
          Switch active team, manage members, and control invite access for locations, guests, and logs.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Active team context</p>
              <p className="text-xs text-muted-foreground">Your APIs and dashboards use this team by default.</p>
            </div>
            {nextPath && (
              <Button
                variant="outline"
                onClick={() => router.push(nextPath)}
                disabled={!activeTeam}
              >
                Continue to requested page
              </Button>
            )}
          </div>

          {loadingTeams ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              Loading teams...
            </div>
          ) : teams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No teams yet. Create your first team below.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className={`rounded-xl border px-3 py-3 ${team.isActive ? 'border-cyan-300 bg-cyan-50/50' : 'border-border bg-background'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{team.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{team.slug}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(team.role)}`}>
                      {team.role}
                    </span>
                  </div>
                  <div className="mt-3">
                    {team.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Active
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={switchingTeamId === team.id}
                        onClick={() => void switchTeam(team.id)}
                      >
                        {switchingTeamId === team.id ? 'Switching...' : 'Switch'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Team Audit Trail</p>
              <p className="text-xs text-muted-foreground">
                Immutable timeline for role changes, ownership transfers, and member removals.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="audit-action-filter">Action (optional)</Label>
                <Select
                  value={auditActionFilter}
                  onValueChange={(value) => setAuditActionFilter((value ?? 'all') as 'all' | TeamAuditAction)}
                  disabled={!canViewAudit}
                >
                  <SelectTrigger id="audit-action-filter" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUDIT_ACTION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audit-from-date">From (optional)</Label>
                <Input
                  id="audit-from-date"
                  type="date"
                  value={auditFromDate}
                  onChange={(e) => setAuditFromDate(e.target.value)}
                  disabled={!canViewAudit}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="audit-to-date">To (optional)</Label>
                <Input
                  id="audit-to-date"
                  type="date"
                  value={auditToDate}
                  onChange={(e) => setAuditToDate(e.target.value)}
                  disabled={!canViewAudit}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="opacity-0">Export</Label>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canViewAudit || exportingAuditCsv || !activeTeam}
                  onClick={() => void exportAuditCsv()}
                >
                  {exportingAuditCsv ? 'Exporting...' : 'Export CSV'}
                </Button>
              </div>
            </div>
          </div>

          {!activeTeam ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Select an active team first.
            </div>
          ) : !canViewAudit ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              You need team admin or owner role to view team audit events.
            </div>
          ) : loadingAudit ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              Loading audit events...
            </div>
          ) : auditEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No audit events yet for this team.
            </div>
          ) : (
            <div className="space-y-2">
              {auditEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-border px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{describeAuditAction(event.action)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {event.action}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>
                      <span className="font-semibold text-foreground">Actor:</span> {displayActor(event.actor)}
                    </p>
                    {event.target && (
                      <p>
                        <span className="font-semibold text-foreground">Target:</span> {displayActor(event.target)}
                      </p>
                    )}
                    {event.metadata && Object.keys(event.metadata).length > 0 && (
                      <p className="break-all">
                        <span className="font-semibold text-foreground">Metadata:</span>{' '}
                        {JSON.stringify(event.metadata)}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              <div className="pt-2">
                {auditNextCursor ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loadingMoreAudit}
                    onClick={() => void loadMoreAudit()}
                  >
                    {loadingMoreAudit ? 'Loading more...' : 'Load more'}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">End of audit history.</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Create team</p>
            <p className="text-xs text-muted-foreground">Add a new tenant and become its owner.</p>
          </div>
          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={createTeam}>
            <Input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name"
              aria-label="Team name"
              required
            />
            <Button type="submit" disabled={creatingTeam || !newTeamName.trim()}>
              {creatingTeam ? 'Creating...' : 'Create Team'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Members</p>
            <p className="text-xs text-muted-foreground">
              {activeTeam
                ? `Viewing ${activeTeam.name}. You are ${activeTeam.role}.`
                : 'Select a team to view members.'}
            </p>
          </div>

          {loadingMembers ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
              Loading members...
            </div>
          ) : !activeTeam ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No active team selected.
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No members found for this team.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-2">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2">Member</th>
                    <th className="px-2">Role</th>
                    <th className="px-2">Status</th>
                    <th className="px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => {
                    const currentDraftRole = draftRole[member.userId] ?? member.teamRole
                    const currentDraftStatus = draftStatus[member.userId] ?? member.status
                    const isEditable = canManageMembers && !member.isSelf && member.teamRole !== 'owner'

                    return (
                      <tr key={member.userId} className="rounded-xl border border-border bg-background">
                        <td className="px-2 py-2">
                          <p className="text-sm font-medium text-foreground">{member.name ?? 'Unnamed user'}</p>
                          <p className="text-xs text-muted-foreground">{member.email ?? 'No email'}</p>
                        </td>
                        <td className="px-2 py-2">
                          {isEditable ? (
                            <Select
                              value={currentDraftRole}
                              onValueChange={(value) =>
                                setDraftRole((current) => ({
                                  ...current,
                                  [member.userId]: (value ?? member.teamRole) as TeamRole,
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ROLE_OPTIONS
                                  .filter((option) => option.value !== 'owner')
                                  .map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleBadgeClass(member.teamRole)}`}>
                              {member.teamRole}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {isEditable ? (
                            <Select
                              value={currentDraftStatus}
                              onValueChange={(value) =>
                                setDraftStatus((current) => ({
                                  ...current,
                                  [member.userId]: (value ?? member.status) as TeamStatus,
                                }))
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="active">active</SelectItem>
                                <SelectItem value="suspended">suspended</SelectItem>
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-sm text-muted-foreground">{member.status}</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {isEditable ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void saveMember(member)}
                                disabled={savingMemberUserId === member.userId}
                              >
                                {savingMemberUserId === member.userId ? 'Saving...' : 'Save'}
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void removeMember(member)}
                                disabled={removingMemberUserId === member.userId}
                              >
                                {removingMemberUserId === member.userId ? 'Removing...' : 'Remove'}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {member.isSelf ? 'Current user' : 'No permission'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Ownership Transfer</p>
            <p className="text-xs text-muted-foreground">
              Move resource ownership of this team to another active member.
            </p>
          </div>

          {!activeTeam ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Select an active team first.
            </div>
          ) : !isOwner ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Only current team owner can transfer ownership.
            </div>
          ) : ownershipCandidates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Add another active member before transferring ownership.
            </div>
          ) : (
            <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={transferOwnership}>
              <div className="space-y-1.5">
                <Label htmlFor="ownership-target-user">New owner</Label>
                <Select
                  value={transferTargetUserId}
                  onValueChange={(value) => setTransferTargetUserId(value ?? '')}
                  required
                >
                  <SelectTrigger id="ownership-target-user" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ownershipCandidates.map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {(member.name ?? member.email ?? member.userId) +
                          ` (${member.teamRole})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="opacity-0">Transfer</Label>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={transferringOwnership || !transferTargetUserId}
                >
                  {transferringOwnership ? 'Transferring...' : 'Transfer Ownership'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Invites</p>
            <p className="text-xs text-muted-foreground">Invite users by email to this team.</p>
          </div>

          {!activeTeam ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              Select an active team to manage invites.
            </div>
          ) : !canManageInvites ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              You need team admin or owner role to manage invites.
            </div>
          ) : (
            <>
              <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]" onSubmit={createInvite}>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="member@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-role">Role</Label>
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => setInviteRole((value ?? 'member') as Exclude<TeamRole, 'owner'>)}
                    required
                  >
                    <SelectTrigger id="invite-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INVITE_ROLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="opacity-0">Send</Label>
                  <Button type="submit" disabled={creatingInvite || !inviteEmail.trim()}>
                    {creatingInvite ? 'Sending...' : 'Send Invite'}
                  </Button>
                </div>
              </form>

              {loadingInvites ? (
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
                  Loading invites...
                </div>
              ) : invites.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
                  No pending invites.
                </div>
              ) : (
                <div className="space-y-2">
                  {invites.map((invite) => (
                    <div
                      key={invite.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{invite.email}</p>
                        <p className="text-xs text-muted-foreground">
                          role {invite.role} | expires {new Date(invite.expiresAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="max-w-[220px] truncate rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          /api/teams/invites/{invite.token}/accept
                        </code>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void revokeInvite(invite.id)}
                          disabled={revokingInviteId === invite.id}
                        >
                          {revokingInviteId === invite.id ? 'Revoking...' : 'Revoke'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

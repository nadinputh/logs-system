'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowRightLeft, ChevronDown, MailX, UserMinus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogIcon,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { AddUserDirect } from './AddUserDirect'

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
  // Admin-provisioned account that never reached a password. Drives the
  // "Resend set-password" control.
  awaitingPassword?: boolean
  isSelf: boolean
}

interface TeamInviteRow {
  id: string
  email: string
  role: Exclude<TeamRole, 'owner'>
  status: 'pending' | 'accepted' | 'revoked'
  expiresAt: string
  // No `token`: only its hash is stored, so the list has no plaintext to show.
  // Reissue with Resend to get a fresh link.
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

// Deliberately off cyan/sky (reserved for the One Signal Rule) and off emerald
// (reserved for the "Active" occupancy/team-status pill, which this badge sits
// next to). Every hue carries a light/dark foreground pair per DESIGN.md.
function roleBadgeClass(role: TeamRole) {
  switch (role) {
    case 'owner':
      return 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
    case 'admin':
      return 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20'
    case 'manager':
      return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20'
    case 'auditor':
      return 'bg-default text-muted border-border'
    case 'member':
    default:
      return 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/20'
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

// Known audit metadata shapes get a human sentence; anything else falls back
// to the raw pairs in the caller so no metadata is ever silently hidden.
function describeAuditMetadata(action: TeamAuditAction, metadata: Record<string, unknown>): string | null {
  if (action === 'member_role_changed' && 'previousRole' in metadata && 'newRole' in metadata) {
    return `Role changed from ${metadata.previousRole} to ${metadata.newRole}`
  }
  if (action === 'member_status_changed' && 'previousStatus' in metadata && 'newStatus' in metadata) {
    return `Status changed from ${metadata.previousStatus} to ${metadata.newStatus}`
  }
  if (action === 'member_removed' && 'previousRole' in metadata && 'previousStatus' in metadata) {
    return `Was ${metadata.previousRole}, ${metadata.previousStatus}, at the time of removal`
  }
  if (
    action === 'ownership_transferred' &&
    'previousOwnerNewRole' in metadata &&
    'newOwnerPreviousRole' in metadata
  ) {
    return `Previous owner is now ${metadata.previousOwnerNewRole}; new owner was previously ${metadata.newOwnerPreviousRole}`
  }
  return null
}

// One shape covers all three destructive/high-stakes confirmations on this
// page (remove member, revoke invite, transfer ownership), so they render
// through a single Dialog instead of three near-identical copies.
type ConfirmState =
  | { kind: 'remove-member'; member: TeamMemberRow }
  | { kind: 'revoke-invite'; invite: TeamInviteRow }
  | { kind: 'transfer-ownership'; targetLabel: string }

// A collapsed-by-default section for the page's occasional-use, setup-style
// cards (audit trail, team creation, ownership transfer, invites, direct
// add). Keeping these closed on load is what makes "Active team context" and
// "Members" — the two things a daily admin actually opens this page for —
// the only things competing for attention on load.
function CollapsibleSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <CardContent className="p-0">
        <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              {description && <p className="max-w-2xl text-xs text-muted">{description}</p>}
            </div>
            <ChevronDown
              className={`mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </summary>
          <div className="space-y-4 px-4 pb-4">{children}</div>
        </details>
      </CardContent>
    </Card>
  )
}

export default function TeamSettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Only a real redirect (someone bounced here from a page that needed an
  // active team) earns the "Continue to requested page" button — the default
  // fallback below is where the click lands, not a signal the button should show.
  const explicitNextPath = searchParams.get('next')
  const nextPath = explicitNextPath ?? '/dashboard'
  const redirectReason = searchParams.get('reason') as
    | 'no_active_team'
    | 'removed'
    | 'suspended'
    | 'team_deleted'
    | 'insufficient_role'
    | null
  const reasonBanner = (() => {
    switch (redirectReason) {
      case 'suspended':
        return {
          title: 'Your access to that team is suspended',
          body: 'A team owner or admin paused your membership. Ask them to reactivate you, or switch to another team below.',
        }
      case 'removed':
        return {
          title: 'You are no longer a member of that team',
          body: 'A team owner or admin removed you. If this was a mistake, ask them to invite you again.',
        }
      case 'team_deleted':
        return {
          title: 'That team no longer exists',
          body: 'The team you last used has been deleted. Pick another team below, or start a new one.',
        }
      case 'insufficient_role':
        return {
          title: 'You do not have permission for that page',
          body: 'Your role on the active team does not include access to what you were trying to open.',
        }
      case 'no_active_team':
        return {
          title: 'Pick an active team first',
          body: 'Every dashboard page runs against one team at a time. Pick one below to continue.',
        }
      default:
        return null
    }
  })()
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
  const [resendingInviteId, setResendingInviteId] = useState<string | null>(null)
  const [resendingUserId, setResendingUserId] = useState<string | null>(null)
  /**
   * A link that was minted but not delivered. Held persistently rather than in a
   * toast: for an invite it is the only copy of a token that is now stored only
   * as a hash, and for a set-password link it is the account's sole way in.
   */
  const [pendingLink, setPendingLink] = useState<{ label: string; url: string } | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
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
      setConfirmState(null)
      toast.success('Member removed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove member')
    } finally {
      setRemovingMemberUserId(null)
    }
  }

  /**
   * Reissues a set-password link for a member who never reached one. Without it
   * an expired link was a permanent lockout: sign-in fails with no password,
   * there is no forgot-password route, and re-creating or inviting the user
   * both 409.
   */
  async function resendSetPassword(member: TeamMemberRow) {
    setResendingUserId(member.userId)
    try {
      const res = await fetch('/api/admin/users/resend-set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: member.userId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Failed to resend the set-password link'))
      if (payload.emailDelivered) {
        setPendingLink(null)
        toast.success(`Set-password link sent to ${member.email ?? 'the address'}`)
      } else {
        setPendingLink({
          label: `Set-password link for ${member.email ?? member.name ?? 'this user'}`,
          url: payload.setPasswordUrl ?? '',
        })
        toast.warning('Link created, but the email could not be sent')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resend the set-password link')
    } finally {
      setResendingUserId(null)
    }
  }

  /**
   * Reissues an invite. The stored row holds only the token's hash, so there is
   * no old link to copy — resending mints a fresh one and supersedes the last.
   */
  async function resendInvite(invite: TeamInviteRow) {
    if (!activeTeam) return
    setResendingInviteId(invite.id)
    try {
      const res = await fetch(`/api/teams/${activeTeam.id}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invite.email, role: invite.role }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Failed to resend the invite'))
      await loadInvites(activeTeam.id)
      if (payload.emailDelivered) {
        setPendingLink(null)
        toast.success(`Invite resent to ${invite.email}`)
      } else {
        setPendingLink({
          label: `Invite for ${invite.email}`,
          url: payload.inviteUrl ?? '',
        })
        toast.warning('Invite reissued, but the email could not be sent')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to resend the invite')
    } finally {
      setResendingInviteId(null)
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
      // The plaintext token exists only in this response. Show it when the mail
      // did not go out, because there is no second chance to read it.
      if (payload.emailDelivered) {
        setPendingLink(null)
        toast.success(`Invite sent to ${payload?.invite?.email ?? 'the address'}`)
      } else {
        setPendingLink({
          label: `Invite for ${payload?.invite?.email ?? 'the address'}`,
          url: payload.inviteUrl ?? '',
        })
        toast.warning('Invite created, but the email could not be sent')
      }
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
      setConfirmState(null)
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

  function requestTransferOwnership(e: React.FormEvent) {
    e.preventDefault()
    if (!activeTeam || !transferTargetUserId) return

    const targetMember = ownershipCandidates.find(
      (member) => member.userId === transferTargetUserId,
    )
    const targetLabel = targetMember?.name ?? targetMember?.email ?? 'selected member'
    setConfirmState({ kind: 'transfer-ownership', targetLabel })
  }

  async function performTransferOwnership() {
    if (!activeTeam || !transferTargetUserId) return

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
      setConfirmState(null)
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

  // Shared between the desktop table row and the mobile card layout below —
  // same control, two different surrounding markup shapes.
  function renderMemberRoleControl(member: TeamMemberRow, isEditable: boolean, currentDraftRole: TeamRole) {
    if (!isEditable) {
      return (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeClass(member.teamRole)}`}>
          {member.teamRole}
        </span>
      )
    }
    return (
      <Select
        value={currentDraftRole}
        onValueChange={(value) =>
          setDraftRole((current) => ({
            ...current,
            [member.userId]: (value ?? member.teamRole) as TeamRole,
          }))
        }
        ariaLabel={`Role for ${member.name ?? member.email ?? 'this member'}`}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.filter((option) => option.value !== 'owner').map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  function renderMemberStatusControl(member: TeamMemberRow, isEditable: boolean, currentDraftStatus: TeamStatus) {
    if (!isEditable) {
      return <span className="text-sm text-muted">{member.status}</span>
    }
    return (
      <Select
        value={currentDraftStatus}
        onValueChange={(value) =>
          setDraftStatus((current) => ({
            ...current,
            [member.userId]: (value ?? member.status) as TeamStatus,
          }))
        }
        ariaLabel={`Status for ${member.name ?? member.email ?? 'this member'}`}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">active</SelectItem>
          <SelectItem value="suspended">suspended</SelectItem>
        </SelectContent>
      </Select>
    )
  }

  function renderMemberActions(member: TeamMemberRow, isEditable: boolean) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {isEditable ? (
          <>
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
              onClick={() => setConfirmState({ kind: 'remove-member', member })}
              disabled={removingMemberUserId === member.userId}
            >
              {removingMemberUserId === member.userId ? 'Removing...' : 'Remove'}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted">
            {member.isSelf
              ? 'Current user'
              : member.teamRole === 'owner'
                ? 'Owner — use Ownership Transfer below'
                : 'No permission'}
          </span>
        )}
        {member.awaitingPassword && canManageMembers && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void resendSetPassword(member)}
            disabled={resendingUserId === member.userId}
            aria-label={`Resend set-password link to ${member.email ?? member.name ?? 'this user'}`}
          >
            {resendingUserId === member.userId ? 'Sending...' : 'Resend set-password'}
          </Button>
        )}
      </div>
    )
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

  const confirmBusy =
    confirmState?.kind === 'remove-member'
      ? removingMemberUserId === confirmState.member.userId
      : confirmState?.kind === 'revoke-invite'
        ? revokingInviteId === confirmState.invite.id
        : confirmState?.kind === 'transfer-ownership'
          ? transferringOwnership
          : false

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">Team & Access</h1>
        <p className="max-w-2xl text-sm text-muted">
          Switch active team, manage members, and control invite access for locations, guests, and logs.
        </p>
      </div>

      {reasonBanner && (
        <div
          role="status"
          aria-live="polite"
          className={
            redirectReason === 'suspended' || redirectReason === 'removed' || redirectReason === 'team_deleted'
              ? 'space-y-1 rounded-xl border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 px-4 py-3'
              : 'space-y-1 rounded-xl border border-border bg-muted/30 px-4 py-3'
          }
        >
          <p className="text-sm font-semibold text-foreground">{reasonBanner.title}</p>
          <p className="text-xs text-muted">{reasonBanner.body}</p>
        </div>
      )}

      {pendingLink && (
        <div
          role="status"
          className="space-y-2 rounded-xl border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 px-4 py-3"
        >
          <p className="text-sm font-semibold text-foreground">
            {pendingLink.label} was created, but the email could not be sent.
          </p>
          <p className="text-xs text-muted">
            Pass this link on yourself. It is shown once — the server stores only its hash.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(pendingLink.url)
                toast.success('Link copied')
              }}
              className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs text-muted hover:text-foreground sm:max-w-[420px]"
            >
              {pendingLink.url}
            </button>
            <Button size="sm" variant="outline" onClick={() => setPendingLink(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Active team context</p>
              <p className="text-xs text-muted">Your APIs and dashboards use this team by default.</p>
            </div>
            {explicitNextPath && (
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
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted">
              Loading teams...
            </div>
          ) : teams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              No teams yet. Create your first team below.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {teams.map((team) => (
                <div
                  key={team.id}
                  className={`rounded-xl border px-3 py-3 ${team.isActive ? 'border-cyan-500/30 bg-cyan-500/5' : 'border-border bg-background'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-foreground">{team.name}</p>
                      <p className="truncate text-xs text-muted">{team.slug}</p>
                    </div>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${roleBadgeClass(team.role)}`}>
                      {team.role}
                    </span>
                  </div>
                  <div className="mt-3">
                    {team.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
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

      <CollapsibleSection
        title="Team Audit Trail"
        description="Immutable timeline for role changes, ownership transfers, and member removals."
      >
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
            <Label className="hidden opacity-0 sm:block" aria-hidden>
              Export
            </Label>
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

        {!activeTeam ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              Select an active team first.
            </div>
          ) : !canViewAudit ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              You need team admin or owner role to view team audit events.
            </div>
          ) : loadingAudit ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted">
              Loading audit events...
            </div>
          ) : auditEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              No audit events yet for this team.
            </div>
          ) : (
            <div className="space-y-2">
              {auditEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-border px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{describeAuditAction(event.action)}</p>
                      <p className="text-xs text-muted">
                        {new Date(event.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-border bg-default px-2 py-0.5 text-xs font-medium text-muted">
                      {event.action}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-muted">
                    <p>
                      <span className="font-semibold text-foreground">Actor:</span> {displayActor(event.actor)}
                    </p>
                    {event.target && (
                      <p>
                        <span className="font-semibold text-foreground">Target:</span> {displayActor(event.target)}
                      </p>
                    )}
                    {event.metadata && Object.keys(event.metadata).length > 0 && (() => {
                      const summary = describeAuditMetadata(event.action, event.metadata as Record<string, unknown>)
                      return summary ? (
                        <p>{summary}</p>
                      ) : (
                        <p className="break-all font-mono text-xs">
                          <span className="font-sans font-semibold text-foreground">Metadata:</span>{' '}
                          {JSON.stringify(event.metadata)}
                        </p>
                      )
                    })()}
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
                  <p className="text-xs text-muted">End of audit history.</p>
                )}
              </div>
            </div>
          )}
      </CollapsibleSection>

      <CollapsibleSection title="Create team" description="Add a new tenant and become its owner.">
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
      </CollapsibleSection>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Members</p>
            <p className="text-xs text-muted">
              {activeTeam
                ? `Viewing ${activeTeam.name}. You are ${activeTeam.role}.`
                : 'Select a team to view members.'}
            </p>
          </div>

          {loadingMembers ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted">
              Loading members...
            </div>
          ) : !activeTeam ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              No active team selected.
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              No members found for this team.
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
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
                            <p className="max-w-[220px] truncate text-sm font-medium text-foreground">
                              {member.name ?? 'Unnamed user'}
                            </p>
                            <p className="max-w-[220px] truncate text-xs text-muted">{member.email ?? 'No email'}</p>
                          </td>
                          <td className="px-2 py-2">{renderMemberRoleControl(member, isEditable, currentDraftRole)}</td>
                          <td className="px-2 py-2">{renderMemberStatusControl(member, isEditable, currentDraftStatus)}</td>
                          <td className="px-2 py-2">{renderMemberActions(member, isEditable)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Below `sm`, the table's Actions column clips off-canvas with
                  no scroll affordance — an admin removing access from a phone
                  couldn't reach it. A stacked card keeps every control visible. */}
              <div className="space-y-2 sm:hidden">
                {members.map((member) => {
                  const currentDraftRole = draftRole[member.userId] ?? member.teamRole
                  const currentDraftStatus = draftStatus[member.userId] ?? member.status
                  const isEditable = canManageMembers && !member.isSelf && member.teamRole !== 'owner'

                  return (
                    <div key={member.userId} className="space-y-3 rounded-xl border border-border bg-background p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{member.name ?? 'Unnamed user'}</p>
                        <p className="truncate text-xs text-muted">{member.email ?? 'No email'}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Role</p>
                          {renderMemberRoleControl(member, isEditable, currentDraftRole)}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Status</p>
                          {renderMemberStatusControl(member, isEditable, currentDraftStatus)}
                        </div>
                      </div>
                      {renderMemberActions(member, isEditable)}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CollapsibleSection
        title="Ownership Transfer"
        description="Move resource ownership of this team to another active member."
      >
        {!activeTeam ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            Select an active team first.
          </div>
        ) : !isOwner ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            Only current team owner can transfer ownership.
          </div>
        ) : ownershipCandidates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            Add another active member before transferring ownership.
          </div>
        ) : (
          <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={requestTransferOwnership}>
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
              <Label className="hidden opacity-0 md:block" aria-hidden>
                Transfer
              </Label>
              {/* Red is reserved for the confirm dialog's actual point of no
                  return — this trigger only opens that dialog. */}
              <Button type="submit" disabled={!transferTargetUserId}>
                Transfer Ownership
              </Button>
            </div>
          </form>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Invites" description="Invite users by email to this team.">
        {!activeTeam ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            Select an active team to manage invites.
          </div>
        ) : !canManageInvites ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
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
                  <Label className="hidden opacity-0 md:block" aria-hidden>
                    Send
                  </Label>
                  <Button type="submit" disabled={creatingInvite || !inviteEmail.trim()}>
                    {creatingInvite ? 'Creating...' : 'Create invite'}
                  </Button>
                </div>
              </form>

              {loadingInvites ? (
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted">
                  Loading invites...
                </div>
              ) : invites.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
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
                        <p className="text-xs text-muted">
                          role {invite.role} | expires {new Date(invite.expiresAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void resendInvite(invite)}
                          disabled={resendingInviteId === invite.id}
                          aria-label={`Resend the invite to ${invite.email}`}
                        >
                          {resendingInviteId === invite.id ? 'Sending...' : 'Resend'}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirmState({ kind: 'revoke-invite', invite })}
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
      </CollapsibleSection>

      {activeTeam && (
        <CollapsibleSection
          title="Add user directly"
          description="Creates the account now and emails a set-password link (active on the current team)."
        >
          <AddUserDirect
            canManage={Boolean(activeTeam.canManageMembers)}
            isOwner={activeTeam.role === 'owner'}
          />
        </CollapsibleSection>
      )}

      <Dialog
        open={Boolean(confirmState)}
        onOpenChange={(open) => {
          if (!open && !confirmBusy) setConfirmState(null)
        }}
      >
        <DialogContent size="xs">
          {confirmState?.kind === 'remove-member' && (
            <>
              <DialogHeader>
                <DialogIcon className="size-12 rounded-full bg-[var(--status-danger)]/10 text-[var(--status-danger)]">
                  <UserMinus className="size-5" aria-hidden />
                </DialogIcon>
                <DialogTitle className="mt-4 text-xl font-semibold tracking-normal">
                  Remove {confirmState.member.name ?? confirmState.member.email ?? 'this member'}?
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="mt-3 text-sm leading-6 text-muted">
                They lose access to this team&apos;s locations, logs, and settings immediately. You can
                re-invite them later.
              </DialogBody>
              <DialogFooter className="mt-5 gap-2">
                <Button variant="outline" size="sm" onPress={() => setConfirmState(null)} isDisabled={confirmBusy}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onPress={() => void removeMember(confirmState.member)}
                  isLoading={confirmBusy}
                  loadingBehavior="busy"
                >
                  Remove member
                </Button>
              </DialogFooter>
            </>
          )}
          {confirmState?.kind === 'revoke-invite' && (
            <>
              <DialogHeader>
                <DialogIcon className="size-12 rounded-full bg-[var(--status-danger)]/10 text-[var(--status-danger)]">
                  <MailX className="size-5" aria-hidden />
                </DialogIcon>
                <DialogTitle className="mt-4 text-xl font-semibold tracking-normal">
                  Revoke the invite to {confirmState.invite.email}?
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="mt-3 text-sm leading-6 text-muted">
                The invite link stops working immediately. You can send a new one from this page any time.
              </DialogBody>
              <DialogFooter className="mt-5 gap-2">
                <Button variant="outline" size="sm" onPress={() => setConfirmState(null)} isDisabled={confirmBusy}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onPress={() => void revokeInvite(confirmState.invite.id)}
                  isLoading={confirmBusy}
                  loadingBehavior="busy"
                >
                  Revoke invite
                </Button>
              </DialogFooter>
            </>
          )}
          {confirmState?.kind === 'transfer-ownership' && (
            <>
              <DialogHeader>
                <DialogIcon className="size-12 rounded-full bg-[var(--status-warning)]/10 text-[var(--status-warning)]">
                  <ArrowRightLeft className="size-5" aria-hidden />
                </DialogIcon>
                <DialogTitle className="mt-4 text-xl font-semibold tracking-normal">
                  Transfer ownership to {confirmState.targetLabel}?
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="mt-3 text-sm leading-6 text-muted">
                {activeTeam?.name ?? 'This team'}&apos;s ownership moves to {confirmState.targetLabel}. Your own
                role becomes admin — you keep managing members and invites, just not transferring ownership
                again yourself.
              </DialogBody>
              <DialogFooter className="mt-5 gap-2">
                <Button variant="outline" size="sm" onPress={() => setConfirmState(null)} isDisabled={confirmBusy}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onPress={() => void performTransferOwnership()}
                  isLoading={confirmBusy}
                  loadingBehavior="busy"
                >
                  Transfer ownership
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

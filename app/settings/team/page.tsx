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
import { useLocale, useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'

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
  // t('resendSetPassword') control.
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

const ROLE_OPTIONS: Array<{ value: TeamRole }> = [
  { value: 'owner' },
  { value: 'admin' },
  { value: 'manager' },
  { value: 'member' },
  { value: 'auditor' },
]

const INVITE_ROLE_OPTIONS: Array<{ value: Exclude<TeamRole, 'owner'> }> = [
  { value: 'admin' },
  { value: 'manager' },
  { value: 'member' },
  { value: 'auditor' },
]

const AUDIT_ACTION_OPTIONS: Array<{ value: 'all' | TeamAuditAction }> = [
  { value: 'all' },
  { value: 'member_role_changed' },
  { value: 'member_status_changed' },
  { value: 'member_removed' },
  { value: 'ownership_transferred' },
]

// Deliberately off cyan/sky/teal (brand, reserved for the One Signal Rule) and
// off every Semantic Status hue documented in DESIGN.md — emerald (Success),
// amber (Warning), and slate (Neutral Track) — so a role badge never reads as
// a live state. Owner previously reused amber (identical class combo to the
// warning banners on the dashboard/check-in flow) and member previously reused
// slate (the completion-bar "Neutral Track" hue); both are role identity, not
// state, per the Status-Is-Not-Brand Rule, so they've moved to rose and zinc.
// Every hue still carries a light/dark foreground pair per DESIGN.md.
function roleBadgeClass(role: TeamRole) {
  switch (role) {
    case 'owner':
      return 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20'
    case 'admin':
      return 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20'
    case 'manager':
      return 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20'
    case 'auditor':
      return 'bg-default text-muted border-border'
    case 'member':
    default:
      return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 border-zinc-500/20'
  }
}

type T = (key: string, values?: Record<string, string | number>) => string

function describeAuditAction(action: TeamAuditAction, t: T) {
  if (action === 'member_role_changed') return t('auditTitleRole')
  if (action === 'member_status_changed') return t('auditTitleStatus')
  return t(`audit_${action}`)
}

function displayActor(actor: TeamAuditActor | null, t: T) {
  if (!actor) return t('unknownUser')
  return actor.name ?? actor.email ?? actor.id
}

// Known audit metadata shapes get a human sentence; anything else falls back
// to the raw pairs in the caller so no metadata is ever silently hidden.
function describeAuditMetadata(action: TeamAuditAction, metadata: Record<string, unknown>, t: T): string | null {
  if (action === 'member_role_changed' && 'previousRole' in metadata && 'newRole' in metadata) {
    return t('metaRole', { from: String(metadata.previousRole), to: String(metadata.newRole) })
  }
  if (action === 'member_status_changed' && 'previousStatus' in metadata && 'newStatus' in metadata) {
    return t('metaStatus', { from: String(metadata.previousStatus), to: String(metadata.newStatus) })
  }
  if (action === 'member_removed' && 'previousRole' in metadata && 'previousStatus' in metadata) {
    return t('metaRemoved', { role: String(metadata.previousRole), status: String(metadata.previousStatus) })
  }
  if (
    action === 'ownership_transferred' &&
    'previousOwnerNewRole' in metadata &&
    'newOwnerPreviousRole' in metadata
  ) {
    return t('metaOwnership', { prev: String(metadata.previousOwnerNewRole), next: String(metadata.newOwnerPreviousRole) })
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
// add). Keeping these closed on load is what makes t('activeTeamContext') and
// t('members') — the two things a daily admin actually opens this page for —
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
  const t = useTranslations('team')
  const apiError = useApiError()
  const locale = useLocale()
  const tCommon = useTranslations('common')
  const roleLabel = (role: string) => tCommon(`role${role[0].toUpperCase()}${role.slice(1)}`)
  const router = useRouter()
  const searchParams = useSearchParams()
  // Only a real redirect (someone bounced here from a page that needed an
  // active team) earns the t('continueToRequestedPage') button — the default
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
          title: t('yourAccessToThatTeam'),
          body: t('aTeamOwnerOrAdmin'),
        }
      case 'removed':
        return {
          title: t('youAreNoLongerA'),
          body: t('aTeamOwnerOrAdmin2'),
        }
      case 'team_deleted':
        return {
          title: t('thatTeamNoLongerExists'),
          body: t('theTeamYouLastUsed'),
        }
      case 'insufficient_role':
        return {
          title: t('youDoNotHavePermission'),
          body: t('yourRoleOnTheActive'),
        }
      case 'no_active_team':
        return {
          title: t('pickAnActiveTeamFirst'),
          body: t('everyDashboardPageRunsAgainst'),
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
        throw new Error(apiError(payload, t('failedToLoadTeams')))
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
      toast.error(error instanceof Error ? error.message : t('failedToLoadTeams'))
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
        throw new Error(apiError(payload, t('failedToLoadTeamMembers')))
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
      toast.error(error instanceof Error ? error.message : t('failedToLoadTeamMembers'))
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
        throw new Error(apiError(payload, t('failedToLoadInvites')))
      }
      setInvites((payload.invites ?? []) as TeamInviteRow[])
    } catch (error) {
      setInvites([])
      toast.error(error instanceof Error ? error.message : t('failedToLoadInvites'))
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
        throw new Error(apiError(payload, t('failedToLoadTeamAudit')))
      }

      const nextEvents = (payload.events ?? []) as TeamAuditEvent[]
      setAuditEvents((current) => (append ? [...current, ...nextEvents] : nextEvents))
      setAuditNextCursor(payload.nextCursor ?? null)
    } catch (error) {
      if (!append) {
        setAuditEvents([])
        setAuditNextCursor(null)
      }
      toast.error(error instanceof Error ? error.message : t('failedToLoadTeamAudit'))
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
        throw new Error(apiError(payload, t('failedToSwitchTeam')))
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
      toast.success(t('activeTeamUpdated'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToSwitchTeam'))
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
        throw new Error(apiError(payload, t('failedToCreateTeam')))
      }

      setNewTeamName('')
      await loadTeams()
      toast.success(t('teamCreated'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToCreateTeam'))
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
        throw new Error(apiError(payload, t('failedToUpdateMember')))
      }

      setMembers((current) =>
        current.map((row) =>
          row.userId === member.userId
            ? { ...row, teamRole: nextRole, status: nextStatus }
            : row,
        ),
      )
      toast.success(t('memberUpdated'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToUpdateMember'))
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
        throw new Error(apiError(payload, t('failedToRemoveMember')))
      }

      setMembers((current) => current.filter((row) => row.userId !== member.userId))
      setConfirmState(null)
      toast.success(t('toastMemberRemoved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToRemoveMember'))
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
      if (!res.ok) throw new Error(apiError(payload, t('failedToResendTheSet')))
      if (payload.emailDelivered) {
        setPendingLink(null)
        toast.success(t('toastSetPwSent', { email: member.email ?? t('theAddress') }))
      } else {
        setPendingLink({
          label: `Set-password link for ${member.email ?? member.name ?? 'this user'}`,
          url: payload.setPasswordUrl ?? '',
        })
        toast.warning(t('linkCreatedButTheEmail'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToResendTheSet'))
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
      if (!res.ok) throw new Error(apiError(payload, t('failedToResendTheInvite')))
      await loadInvites(activeTeam.id)
      if (payload.emailDelivered) {
        setPendingLink(null)
        toast.success(t('toastInviteResent', { email: invite.email }))
      } else {
        setPendingLink({
          label: t('inviteFor', { email: invite.email }),
          url: payload.inviteUrl ?? '',
        })
        toast.warning(t('inviteReissuedButTheEmail'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToResendTheInvite'))
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
        throw new Error(apiError(payload, t('failedToSendInvite')))
      }

      setInviteEmail('')
      setInviteRole('member')
      await loadInvites(activeTeam.id)
      // The plaintext token exists only in this response. Show it when the mail
      // did not go out, because there is no second chance to read it.
      if (payload.emailDelivered) {
        setPendingLink(null)
        toast.success(t('toastInviteSent', { email: payload?.invite?.email ?? t('theAddress') }))
      } else {
        setPendingLink({
          label: t('inviteFor', { email: payload?.invite?.email ?? t('theAddress') }),
          url: payload.inviteUrl ?? '',
        })
        toast.warning(t('inviteCreatedButTheEmail'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToSendInvite'))
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
        throw new Error(apiError(payload, t('failedToRevokeInvite')))
      }

      setInvites((current) => current.filter((invite) => invite.id !== inviteId))
      setConfirmState(null)
      toast.success(t('inviteRevoked'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToRevokeInvite'))
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
          throw new Error(apiError(payload, t('failedToExportAuditCsv')))
        }
        throw new Error(t('failedToExportAuditCsv'))
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

      toast.success(t('auditCsvExported'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToExportAuditCsv'))
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
    const targetLabel = targetMember?.name ?? targetMember?.email ?? t('selectedMember')
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
        throw new Error(apiError(payload, t('failedToTransferOwnership')))
      }

      setTransferTargetUserId('')
      setConfirmState(null)
      await Promise.all([
        loadTeams(),
        loadMembers(activeTeam.id),
        loadInvites(activeTeam.id),
        loadAudit(activeTeam.id, true, auditActionFilter, auditFromDate, auditToDate),
      ])
      toast.success(t('audit_ownership_transferred'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToTransferOwnership'))
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
          {roleLabel(member.teamRole)}
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
        ariaLabel={t('roleFor', { name: member.name ?? member.email ?? t('thisMember') })}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLE_OPTIONS.filter((option) => option.value !== 'owner').map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {roleLabel(option.value)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  function renderMemberStatusControl(member: TeamMemberRow, isEditable: boolean, currentDraftStatus: TeamStatus) {
    if (!isEditable) {
      return <span className="text-sm text-muted">{member.status === 'active' ? t('statusActive') : t('statusSuspended')}</span>
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
        ariaLabel={t('statusFor', { name: member.name ?? member.email ?? t('thisMember') })}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">{t('active')}</SelectItem>
          <SelectItem value="suspended">{t('suspended')}</SelectItem>
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
              {savingMemberUserId === member.userId ? t('saving') : t('save')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmState({ kind: 'remove-member', member })}
              disabled={removingMemberUserId === member.userId}
            >
              {removingMemberUserId === member.userId ? t('removing') : t('remove')}
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted">
            {member.isSelf
              ? t('currentUser')
              : member.teamRole === 'owner'
                ? t('ownerUseOwnershipTransferBelow')
                : t('noPermission')}
          </span>
        )}
        {member.awaitingPassword && canManageMembers && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void resendSetPassword(member)}
            disabled={resendingUserId === member.userId}
            aria-label={t('resendSetPwAria', { name: member.email ?? member.name ?? t('thisUser') })}
          >
            {resendingUserId === member.userId ? t('sending') : t('resendSetPassword')}
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
        {t('backToDashboard')}
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{t('teamAccess')}</h1>
        <p className="max-w-2xl text-sm text-muted">
          {t('switchActiveTeamManageMembers')}
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
            {t('passThisLinkOnYourself')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(pendingLink.url)
                toast.success(t('linkCopied'))
              }}
              className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs text-muted hover:text-foreground sm:max-w-[420px]"
            >
              {pendingLink.url}
            </button>
            <Button size="sm" variant="outline" onClick={() => setPendingLink(null)}>
              {t('dismiss')}
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{t('activeTeamContext')}</p>
              <p className="text-xs text-muted">{t('yourApisAndDashboardsUse')}</p>
            </div>
            {explicitNextPath && (
              <Button
                variant="outline"
                onClick={() => router.push(nextPath)}
                disabled={!activeTeam}
              >
                {t('continueToRequestedPage')}
              </Button>
            )}
          </div>

          {loadingTeams ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted">
              {t('loadingTeams')}
            </div>
          ) : teams.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              {t('noTeamsYetCreateYour')}
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
                      {roleLabel(team.role)}
                    </span>
                  </div>
                  <div className="mt-3">
                    {team.isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        {t('active2')}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={switchingTeamId === team.id}
                        onClick={() => void switchTeam(team.id)}
                      >
                        {switchingTeamId === team.id ? t('switching') : t('switch')}
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
        title={t('teamAuditTrail')}
        description={t('immutableTimelineForRoleChanges')}
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="audit-action-filter">{t('actionOptional')}</Label>
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
                    {option.value === 'all' ? t('auditAll') : t(`audit_${option.value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-from-date">{t('fromOptional')}</Label>
            <Input
              id="audit-from-date"
              type="date"
              value={auditFromDate}
              onChange={(e) => setAuditFromDate(e.target.value)}
              disabled={!canViewAudit}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-to-date">{t('toOptional')}</Label>
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
              {t('export')}
            </Label>
            <Button
              type="button"
              variant="outline"
              disabled={!canViewAudit || exportingAuditCsv || !activeTeam}
              onClick={() => void exportAuditCsv()}
            >
              {exportingAuditCsv ? t('exporting') : t('exportCsv')}
            </Button>
          </div>
        </div>

        {!activeTeam ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              {t('selectAnActiveTeamFirst')}
            </div>
          ) : !canViewAudit ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              {t('youNeedTeamAdminOr')}
            </div>
          ) : loadingAudit ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted">
              {t('loadingAuditEvents')}
            </div>
          ) : auditEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              {t('noAuditEventsYetFor')}
            </div>
          ) : (
            <div className="space-y-2">
              {auditEvents.map((event) => (
                <div key={event.id} className="rounded-xl border border-border px-3 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{describeAuditAction(event.action, t)}</p>
                      <p className="text-xs text-muted">
                        {new Date(event.createdAt).toLocaleString(locale)}
                      </p>
                    </div>
                    <span className="inline-flex rounded-full border border-border bg-default px-2 py-0.5 text-xs font-medium text-muted">
                      {t(`audit_${event.action}`)}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1 text-xs text-muted">
                    <p>
                      <span className="font-semibold text-foreground">{t('actor')}</span> {displayActor(event.actor, t)}
                    </p>
                    {event.target && (
                      <p>
                        <span className="font-semibold text-foreground">{t('target')}</span> {displayActor(event.target, t)}
                      </p>
                    )}
                    {event.metadata && Object.keys(event.metadata).length > 0 && (() => {
                      const summary = describeAuditMetadata(event.action, event.metadata as Record<string, unknown>, t)
                      return summary ? (
                        <p>{summary}</p>
                      ) : (
                        <p className="break-all font-mono text-xs">
                          <span className="font-sans font-semibold text-foreground">{t('metadata')}</span>{' '}
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
                    {loadingMoreAudit ? t('loadingMore') : t('loadMore')}
                  </Button>
                ) : (
                  <p className="text-xs text-muted">{t('endOfAuditHistory')}</p>
                )}
              </div>
            </div>
          )}
      </CollapsibleSection>

      <CollapsibleSection title={t('createTeam')} description={t('addANewTenantAnd')}>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={createTeam}>
          <Input
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder={t('teamName')}
            aria-label={t('teamName')}
            required
          />
          <Button type="submit" disabled={creatingTeam || !newTeamName.trim()}>
            {creatingTeam ? t('creating') : t('createTeam2')}
          </Button>
        </form>
      </CollapsibleSection>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('members')}</p>
            <p className="text-xs text-muted">
              {activeTeam
                ? t('viewingTeam', { team: activeTeam.name, role: roleLabel(activeTeam.role) })
                : t('selectATeamToView')}
            </p>
          </div>

          {loadingMembers ? (
            <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted">
              {t('loadingMembers')}
            </div>
          ) : !activeTeam ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              {t('noActiveTeamSelected')}
            </div>
          ) : members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
              {t('noMembersFoundForThis')}
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted">
                      <th className="px-2">{t('member')}</th>
                      <th className="px-2">{t('role')}</th>
                      <th className="px-2">{t('status')}</th>
                      <th className="px-2">{t('actions')}</th>
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
                              {member.name ?? t('unnamedUser')}
                            </p>
                            <p className="max-w-[220px] truncate text-xs text-muted">{member.email ?? t('noEmail')}</p>
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
                        <p className="truncate text-sm font-medium text-foreground">{member.name ?? t('unnamedUser')}</p>
                        <p className="truncate text-xs text-muted">{member.email ?? t('noEmail')}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('role')}</p>
                          {renderMemberRoleControl(member, isEditable, currentDraftRole)}
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t('status')}</p>
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
        title={t('ownershipTransfer')}
        description={t('moveResourceOwnershipOfThis')}
      >
        {!activeTeam ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            {t('selectAnActiveTeamFirst')}
          </div>
        ) : !isOwner ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            {t('onlyCurrentTeamOwnerCan')}
          </div>
        ) : ownershipCandidates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            {t('addAnotherActiveMemberBefore')}
          </div>
        ) : (
          <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={requestTransferOwnership}>
            <div className="space-y-1.5">
              <Label htmlFor="ownership-target-user">{t('newOwner')}</Label>
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
                        ` (${roleLabel(member.teamRole)})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="hidden opacity-0 md:block" aria-hidden>
                {t('transfer')}
              </Label>
              {/* Red is reserved for the confirm dialog's actual point of no
                  return — this trigger only opens that dialog. */}
              <Button type="submit" disabled={!transferTargetUserId}>
                {t('transferOwnership')}
              </Button>
            </div>
          </form>
        )}
      </CollapsibleSection>

      <CollapsibleSection title={t('invites')} description={t('inviteUsersByEmailTo')}>
        {!activeTeam ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            {t('selectAnActiveTeamTo')}
          </div>
        ) : !canManageInvites ? (
          <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            {t('youNeedTeamAdminOr2')}
          </div>
        ) : (
          <>
              <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]" onSubmit={createInvite}>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email">{t('email')}</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder={t('memberExampleCom')}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-role">{t('role')}</Label>
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
                          {roleLabel(option.value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="hidden opacity-0 md:block" aria-hidden>
                    {t('send')}
                  </Label>
                  <Button type="submit" disabled={creatingInvite || !inviteEmail.trim()}>
                    {creatingInvite ? t('creating') : t('createInvite')}
                  </Button>
                </div>
              </form>

              {loadingInvites ? (
                <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted">
                  {t('loadingInvites')}
                </div>
              ) : invites.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
                  {t('noPendingInvites')}
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
                          {t('inviteMeta', { role: roleLabel(invite.role), date: new Date(invite.expiresAt).toLocaleString(locale) })}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void resendInvite(invite)}
                          disabled={resendingInviteId === invite.id}
                          aria-label={t('resendInviteAria', { email: invite.email })}
                        >
                          {resendingInviteId === invite.id ? t('sending') : t('resend')}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirmState({ kind: 'revoke-invite', invite })}
                          disabled={revokingInviteId === invite.id}
                        >
                          {revokingInviteId === invite.id ? t('revoking') : t('revoke')}
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
          title={t('addUserDirectly')}
          description={t('createsTheAccountNowAnd')}
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
                  {t('confirmRemoveTitle', { name: confirmState.member.name ?? confirmState.member.email ?? t('thisMember') })}
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="mt-3 text-sm leading-6 text-muted">
                {t('confirmRemoveBody')}
              </DialogBody>
              <DialogFooter className="mt-5 gap-2">
                <Button variant="outline" size="sm" onPress={() => setConfirmState(null)} isDisabled={confirmBusy}>
                  {t('cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onPress={() => void removeMember(confirmState.member)}
                  isLoading={confirmBusy}
                  loadingBehavior="busy"
                >
                  {t('removeMember')}
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
                  {t('confirmRevokeTitle', { email: confirmState.invite.email })}
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="mt-3 text-sm leading-6 text-muted">
                {t('theInviteLinkStopsWorking')}
              </DialogBody>
              <DialogFooter className="mt-5 gap-2">
                <Button variant="outline" size="sm" onPress={() => setConfirmState(null)} isDisabled={confirmBusy}>
                  {t('cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onPress={() => void revokeInvite(confirmState.invite.id)}
                  isLoading={confirmBusy}
                  loadingBehavior="busy"
                >
                  {t('revokeInvite')}
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
                  {t('confirmTransferTitle', { target: confirmState.targetLabel })}
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="mt-3 text-sm leading-6 text-muted">
                {t('confirmTransferBody', { team: activeTeam?.name ?? t('thisTeam'), target: confirmState.targetLabel })}
              </DialogBody>
              <DialogFooter className="mt-5 gap-2">
                <Button variant="outline" size="sm" onPress={() => setConfirmState(null)} isDisabled={confirmBusy}>
                  {t('cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onPress={() => void performTransferOwnership()}
                  isLoading={confirmBusy}
                  loadingBehavior="busy"
                >
                  {t('transferOwnership2')}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

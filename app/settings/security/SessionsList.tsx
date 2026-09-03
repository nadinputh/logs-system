'use client'

import { useCallback, useMemo, useState } from 'react'
import { signOut } from 'next-auth/react'
import {
  ShieldOff,
  Monitor,
  Smartphone,
  Fingerprint,
  KeyRound,
  Trash2,
  Search,
  ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormNotice } from '@/components/auth/FormNotice'
import { toast } from '@/components/ui/sonner'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogIcon,
  DialogTitle,
} from '@/components/ui/dialog'

export type SessionRow = {
  id: string
  jti: string
  createdAt: string
  lastSeenAt: string
  ipAddress: string
  userAgent: string
  provider: 'credentials' | 'passkey'
  current: boolean
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const seconds = Math.max(1, Math.round((now - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function summarizeUserAgent(ua: string): { label: string; kind: 'phone' | 'desktop' } {
  const s = ua.toLowerCase()
  const isPhone = /iphone|android.*mobile|mobile safari/.test(s)
  let os = 'Unknown OS'
  if (/iphone|ipad|ipod/.test(s)) os = 'iOS'
  else if (/android/.test(s)) os = 'Android'
  else if (/mac os x|macintosh/.test(s)) os = 'macOS'
  else if (/windows/.test(s)) os = 'Windows'
  else if (/linux/.test(s)) os = 'Linux'
  let browser = 'browser'
  if (/edg\//.test(s)) browser = 'Edge'
  else if (/chrome\//.test(s) && !/edg\//.test(s)) browser = 'Chrome'
  else if (/firefox\//.test(s)) browser = 'Firefox'
  else if (/safari\//.test(s) && !/chrome\//.test(s)) browser = 'Safari'
  return { label: `${browser} on ${os}`, kind: isPhone ? 'phone' : 'desktop' }
}

// A session earns its own group by how recently it was *used*, not when it
// was created — a two-week-old login that's still active today belongs in
// "Today," not buried under a stale one from yesterday.
function recencyGroup(lastSeenAt: string): 'today' | 'thisWeek' | 'older' {
  const days = (Date.now() - new Date(lastSeenAt).getTime()) / 86_400_000
  if (days < 1) return 'today'
  if (days < 7) return 'thisWeek'
  return 'older'
}

export function SessionsList({ initial }: { initial: SessionRow[] }) {
  const [sessions, setSessions] = useState<SessionRow[]>(initial)
  const [query, setQuery] = useState('')
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [rowToRevoke, setRowToRevoke] = useState<SessionRow | null>(null)
  const [nukeOpen, setNukeOpen] = useState(false)
  const [nuking, setNuking] = useState(false)

  const otherSessions = useMemo(() => sessions.filter((s) => !s.current), [sessions])
  const currentSession = useMemo(() => sessions.find((s) => s.current), [sessions])

  // Sorted by last activity, not sign-in date — a triaging admin is hunting
  // for what's active *now*, not what's oldest.
  const filteredOther = useMemo(() => {
    const sorted = [...otherSessions].sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    )
    const q = query.trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter((s) => {
      const { label } = summarizeUserAgent(s.userAgent)
      return label.toLowerCase().includes(q) || s.ipAddress.toLowerCase().includes(q)
    })
  }, [otherSessions, query])

  const grouped = useMemo(() => {
    const groups = { today: [] as SessionRow[], thisWeek: [] as SessionRow[], older: [] as SessionRow[] }
    for (const s of filteredOther) groups[recencyGroup(s.lastSeenAt)].push(s)
    return groups
  }, [filteredOther])

  const handleRevokeOne = useCallback(async () => {
    if (!rowToRevoke) return
    setRevokingId(rowToRevoke.id)
    try {
      const res = await fetch(`/api/auth/sessions/${rowToRevoke.id}/revoke`, {
        method: 'POST',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not end that session')
      }
      setSessions((prev) => prev.filter((s) => s.id !== rowToRevoke.id))
      toast.success('That session is ended — the device lands on the login page within a minute.')
      setRowToRevoke(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not end that session')
    } finally {
      setRevokingId(null)
    }
  }, [rowToRevoke])

  const handleNuke = useCallback(async () => {
    setNuking(true)
    try {
      const res = await fetch('/api/auth/signout-others', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Could not end every session')
      }
      // Our own cookie is now stamped with a stale sessionsVersion. End the
      // client session and land on /login with the receipt the redirect can
      // announce — the toast would unmount before it's readable.
      await signOut({ callbackUrl: '/login?reason=signed_out_others' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not end every session')
      setNuking(false)
      setNukeOpen(false)
    }
  }, [])

  return (
    <div className="space-y-5">
      {/* Announcement region for row-revoke feedback — mounted before the
          notice so a screen reader picks it up. */}
      <div aria-live="polite" className="empty:hidden">
        {otherSessions.length === 0 && (
          <p className="text-sm text-muted">
            You&apos;re only signed in on this device. Nothing else to end here.
          </p>
        )}
      </div>

      {currentSession && (
        <ul className="divide-y divide-border/60" role="list">
          <SessionCard session={currentSession} revoking={false} onRevoke={() => undefined} />
        </ul>
      )}

      {otherSessions.length > 0 && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/60" aria-hidden />
            <Input
              placeholder="Filter by device or IP…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
              aria-label="Filter other sessions by device or IP"
            />
          </div>

          {query.trim() && filteredOther.length === 0 ? (
            <p className="px-1 text-sm text-muted">No sessions match &ldquo;{query}&rdquo;.</p>
          ) : (
            <div className="space-y-4">
              <SessionGroup label="Today" rows={grouped.today} revokingId={revokingId} onRevoke={setRowToRevoke} />
              <SessionGroup label="This week" rows={grouped.thisWeek} revokingId={revokingId} onRevoke={setRowToRevoke} />
              <OlderSessionGroup rows={grouped.older} revokingId={revokingId} onRevoke={setRowToRevoke} />
            </div>
          )}
        </div>
      )}

      {otherSessions.length > 0 && currentSession && (
        <div className="pt-2 border-t border-border/60">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                End every session on this account
              </p>
              <p className="text-xs text-muted mt-0.5 max-w-md">
                Nuclear option: bumps{' '}
                <span className="font-mono text-xs">sessionsVersion</span> and drops
                every inventory row. This device lands on the login page too — you can
                sign back in from here.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onPress={() => setNukeOpen(true)}
              isDisabled={nuking}
            >
              <ShieldOff className="mr-1.5 size-3.5" strokeWidth={2.2} />
              End every session
            </Button>
          </div>
        </div>
      )}

      {/* Per-row Revoke dialog — refuses to render for the current session
          because the API refuses to revoke it (see route). Danger-toned to
          match the destructive button below it: ending any session, not just
          every session, is the same class of action. */}
      <Dialog
        open={Boolean(rowToRevoke)}
        onOpenChange={(open) => {
          if (!open && !revokingId) setRowToRevoke(null)
        }}
      >
        <DialogContent size="xs">
          <DialogHeader>
            <DialogIcon className="size-12 rounded-full bg-[var(--status-danger)]/10 text-[var(--status-danger)]">
              <Trash2 className="size-5" aria-hidden />
            </DialogIcon>
            <DialogTitle className="mt-4 text-xl font-semibold tracking-normal">
              End this session?
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="mt-3 text-sm leading-6 text-muted">
            {rowToRevoke && (
              <>
                <span className="block font-medium text-foreground">
                  {summarizeUserAgent(rowToRevoke.userAgent).label}
                </span>
                <span className="block text-xs mt-0.5">
                  Signed in {relativeTime(rowToRevoke.createdAt)} · Last seen{' '}
                  {relativeTime(rowToRevoke.lastSeenAt)} · IP {rowToRevoke.ipAddress}
                </span>
                <span className="block mt-3">
                  That device lands on the login page within a minute. Your other
                  sessions stay signed in.
                </span>
              </>
            )}
          </DialogBody>
          <DialogFooter className="mt-5 gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => setRowToRevoke(null)}
              isDisabled={Boolean(revokingId)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onPress={handleRevokeOne}
              isLoading={revokingId === rowToRevoke?.id}
            >
              End this session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nuclear dialog. Confirmation is *at* the moment of commitment, not
          armed on a previous click — the R3 critique's landmine fix. */}
      <Dialog
        open={nukeOpen}
        onOpenChange={(open) => {
          if (!open && !nuking) setNukeOpen(false)
        }}
      >
        <DialogContent size="xs">
          <DialogHeader>
            <DialogIcon className="size-12 rounded-full bg-[var(--status-danger)]/10 text-[var(--status-danger)]">
              <ShieldOff className="size-5" aria-hidden />
            </DialogIcon>
            <DialogTitle className="mt-4 text-xl font-semibold tracking-normal">
              End every session?
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="mt-3 text-sm leading-6 text-muted">
            <FormNotice
              tone="warning"
              title="This ends every session — including the one you&apos;re using now"
            >
              You&apos;ll be sent to the login page in a moment and can sign back in
              here. Every other browser and phone with an old cookie lands on the login
              page on its next request — usually within a minute of pressing this.
            </FormNotice>
          </DialogBody>
          <DialogFooter className="mt-5 gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => setNukeOpen(false)}
              isDisabled={nuking}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onPress={handleNuke}
              isLoading={nuking}
              loadingBehavior="busy"
            >
              End every session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SessionGroup({
  label,
  rows,
  revokingId,
  onRevoke,
}: {
  label: string
  rows: SessionRow[]
  revokingId: string | null
  onRevoke: (row: SessionRow) => void
}) {
  if (rows.length === 0) return null
  return (
    <div>
      <p className="px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <ul className="divide-y divide-border/60" role="list">
        {rows.map((s) => (
          <SessionCard key={s.id} session={s} revoking={revokingId === s.id} onRevoke={() => onRevoke(s)} />
        ))}
      </ul>
    </div>
  )
}

// The noisy tail: collapsed by default once it's more than a glance, same
// disclosure pattern as Team & Access's CollapsibleSection, sized for a list
// group header rather than a full card.
function OlderSessionGroup({
  rows,
  revokingId,
  onRevoke,
}: {
  rows: SessionRow[]
  revokingId: string | null
  onRevoke: (row: SessionRow) => void
}) {
  if (rows.length === 0) return null
  if (rows.length <= 5) return <SessionGroup label="Older" rows={rows} revokingId={revokingId} onRevoke={onRevoke} />

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-1 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
        Older ({rows.length})
      </summary>
      <ul className="divide-y divide-border/60 mt-1" role="list">
        {rows.map((s) => (
          <SessionCard key={s.id} session={s} revoking={revokingId === s.id} onRevoke={() => onRevoke(s)} />
        ))}
      </ul>
    </details>
  )
}

function SessionCard({
  session,
  revoking,
  onRevoke,
}: {
  session: SessionRow
  revoking: boolean
  onRevoke: () => void
}) {
  const ua = summarizeUserAgent(session.userAgent)
  const DeviceIcon = ua.kind === 'phone' ? Smartphone : Monitor
  const ProviderIcon = session.provider === 'passkey' ? Fingerprint : KeyRound

  return (
    <li className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={
            'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ' +
            (session.current
              ? 'bg-accent/10 text-accent'
              : 'bg-muted/40 text-muted')
          }
          aria-hidden
        >
          <DeviceIcon className="w-4 h-4" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{ua.label}</p>
            {session.current && (
              <span className="inline-flex items-center text-xs font-semibold uppercase tracking-[0.08em] text-accent bg-accent/10 border border-accent/20 px-1.5 py-0.5 rounded-full">
                This device
              </span>
            )}
            <span
              className="inline-flex items-center gap-1 text-xs font-medium text-muted"
              title={`Signed in via ${session.provider}`}
            >
              <ProviderIcon className="w-3 h-3" strokeWidth={2.2} aria-hidden />
              {session.provider === 'passkey' ? 'Passkey' : 'Password'}
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5 truncate">
            Signed in {relativeTime(session.createdAt)} · Last seen{' '}
            {relativeTime(session.lastSeenAt)} · IP {session.ipAddress}
          </p>
        </div>
      </div>
      {/* Indented to align under the label when stacked on mobile instead of
          squeezing into the same line as the badge and truncating. */}
      <div className="pl-12 sm:pl-0 shrink-0">
        {session.current ? (
          <span className="text-xs text-muted">Sign out from the menu</span>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="text-[var(--status-danger)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger)]/10"
            // Rounded relative time ("8h ago") collides across rows signed
            // in the same hour; the absolute signed-in instant is unique in
            // practice, which a rounded label never is.
            aria-label={`Revoke session: ${ua.label}, signed in ${new Date(session.createdAt).toLocaleString()}, IP ${session.ipAddress}`}
            onPress={onRevoke}
            isDisabled={revoking}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </li>
  )
}

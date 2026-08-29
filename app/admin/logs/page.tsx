'use client'

import { useEffect, useState, useCallback } from 'react'
import { EyeIcon, LogOut, MapPin, RefreshCw, Search, ShieldCheck, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/sonner'
import { fetchJsonOnce } from '@/lib/clientFetch'
import { useLogRealtime } from '@/lib/useLogRealtime'

interface LogEntry {
  _id: string; locationId: string; locationType: string
  locationName?: string | null
  locationPath?: string | null
  visitorName?: string
  visitorEmail?: string
  visitorPhone?: string
  visitorGender?: string
  visitPurpose?: string
  sessionToken?: string
  deviceId?: string
  ipAddress?: string
  userAgent?: string
  geofenceStatus?: boolean
  passkeyVerified?: boolean
  autoCheckedOut?: boolean
  timestamp: string
  checkoutAt?: string
  checkoutLog?: {
    _id?: string
    timestamp?: string
    autoCheckedOut?: boolean
  } | null
  corrections?: Correction[]
}

interface Correction {
  field: string
  originalValue: string
  newValue: string
  reasonForChange: string
  timestamp: string
  modifiedByName: string | null
}

// AuditLog stores raw schema field names ("manualCheckout", "visitorName");
// this is the only place that needs to speak both languages.
const CORRECTION_FIELD_LABELS: Record<string, string> = {
  manualCheckout: 'Manual checkout',
  visitorName: 'Name',
  locationId: 'Location',
  locationType: 'Location type',
  timestamp: 'Check-in time',
  action: 'Action',
}

function formatValue(value?: string | boolean | null) {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return value
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function readApiError(payload: any, fallback: string) {
  if (typeof payload?.message === 'string') return payload.message
  if (typeof payload?.error === 'string') return payload.error
  return fallback
}

function durationLabel(entry: LogEntry) {
  if (!entry.checkoutAt) return 'Still checked in'
  const ms = new Date(entry.checkoutAt).getTime() - new Date(entry.timestamp).getTime()
  const minutes = Math.max(0, Math.round(ms / 60000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}h ${rest}m` : `${rest}m`
}

function DetailItem({ label, value }: { label: string; value?: string | boolean | null }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/40 px-3 py-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 break-words text-sm leading-5 text-foreground">{formatValue(value)}</p>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="grid gap-2">{children}</div>
    </section>
  )
}

function LogDetailsDialog({ log, open, onOpenChange }: { log: LogEntry | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!log) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm" className="overflow-hidden bg-overlay [&>div]:flex [&>div]:max-h-[calc(100dvh-2rem)] [&>div]:min-h-0 [&>div]:flex-col">
        <div className="p-5 pb-4 sm:p-6 sm:pb-4">
          <div className="mx-auto w-full max-w-[17.625rem]">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
                <UserRound className="size-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-base font-semibold text-foreground">Guest Details</DialogTitle>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{log.locationName ?? 'Unknown location'}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
        <DialogBody className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
          <div className="mx-auto w-full max-w-[17.625rem] space-y-4">
            <DetailSection title="Visitor">
              <DetailItem label="Name" value={log.visitorName} />
              <DetailItem label="Email" value={log.visitorEmail} />
              <DetailItem label="Phone" value={log.visitorPhone} />
              <DetailItem label="Gender" value={log.visitorGender} />
              <DetailItem label="Purpose" value={log.visitPurpose} />
              <DetailItem label="Session token" value={log.sessionToken} />
            </DetailSection>

            <DetailSection title="Location">
              <DetailItem label="Name" value={log.locationName} />
              <DetailItem label="Path" value={log.locationPath} />
              <DetailItem label="Type" value={log.locationType} />
              <DetailItem label="Location ID" value={log.locationId} />
            </DetailSection>

            <DetailSection title="Check-in / Check-out">
              <DetailItem label="Check-in" value={formatDate(log.timestamp)} />
              <DetailItem label="Check-out" value={formatDate(log.checkoutAt)} />
              <DetailItem label="Duration" value={durationLabel(log)} />
              <DetailItem label="Auto checked out" value={log.checkoutLog?.autoCheckedOut ?? log.autoCheckedOut} />
              <DetailItem label="Passkey verified" value={log.passkeyVerified} />
              <DetailItem label="Checkout log ID" value={log.checkoutLog?._id} />
            </DetailSection>

            <DetailSection title="Request context">
              <DetailItem label="Device ID" value={log.deviceId} />
              <DetailItem label="IP address" value={log.ipAddress} />
              <DetailItem label="Geofence matched" value={log.geofenceStatus} />
              <DetailItem label="User agent" value={log.userAgent} />
            </DetailSection>

            {/* The ledger is append-only, so a correction never overwrites
                this log — but Product Principle 1 requires it be surfaced,
                never silent. Only rendered when a correction actually
                exists, so an ordinary, uncorrected log stays exactly as
                terse as it was before this section existed. */}
            {!!log.corrections?.length && (
              <DetailSection title="Correction">
                {log.corrections.map((c, i) => (
                  <div key={i} className="min-w-0 rounded-xl bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/25 px-3 py-2">
                    <p className="text-xs font-medium text-[var(--status-warning)]">
                      {CORRECTION_FIELD_LABELS[c.field] ?? c.field} · {formatDate(c.timestamp)}
                    </p>
                    <p className="mt-1 break-words text-sm leading-5 text-foreground">{c.reasonForChange}</p>
                    <p className="mt-1 text-xs text-muted">By {c.modifiedByName ?? 'Unknown user'}</p>
                  </div>
                ))}
              </DetailSection>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [manualCheckoutLog, setManualCheckoutLog] = useState<LogEntry | null>(null)
  const [manualCheckoutReason, setManualCheckoutReason] = useState('')
  const [manualCheckoutLoading, setManualCheckoutLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)

    try {
      const data = await fetchJsonOnce<{ logs?: LogEntry[] }>('/api/logs')
      setLogs(data.logs ?? [])
    } catch {
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchLogs() }, [fetchLogs])
  useLogRealtime(() => { void fetchLogs(false) })

  const filtered = logs.filter(l =>
    !search || (l.visitorName ?? '').toLowerCase().includes(search.toLowerCase())
  )

  function openManualCheckout(log: LogEntry) {
    setManualCheckoutLog(log)
    setManualCheckoutReason(log.passkeyVerified ? 'Manual checkout due to passkey verification issue' : '')
  }

  async function submitManualCheckout() {
    if (!manualCheckoutLog) return
    const reasonForChange = manualCheckoutReason.trim()
    if (reasonForChange.length < 3) {
      toast.error('Add a reason before checking out manually')
      return
    }

    setManualCheckoutLoading(true)
    try {
      const res = await fetch(`/api/logs/${manualCheckoutLog._id}/manual-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasonForChange }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(readApiError(payload, 'Manual checkout failed'))

      toast.success(payload.already ? 'Log was already checked out' : 'Checked out manually')
      setManualCheckoutLog(null)
      setManualCheckoutReason('')
      setSelectedLog(null)
      await fetchLogs(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Manual checkout failed')
    } finally {
      setManualCheckoutLoading(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">All Logs</h1>
          {loading ? (
            <Skeleton className="mt-1.5 h-4 w-28" />
          ) : (
            <p className="text-sm text-muted mt-0.5">{logs.length} entries total</p>
          )}
        </div>
        <Button
          type="button"
          onClick={() => { void fetchLogs() }}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/60" aria-hidden />
        <Input
          placeholder="Filter by visitor name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div>
        {loading ? (
          <Table aria-label="Admin logs loading table">
            <TableHeader>
              <TableHead isRowHeader>Visitor</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Check-in</TableHead>
              <TableHead className="hidden lg:table-cell">Check-out</TableHead>
              <TableHead>Actions</TableHead>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 6 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-44 md:hidden" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <ShieldCheck className="w-6 h-6 text-muted/50" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">{search ? 'No matching logs' : 'No logs yet'}</p>
            <p className="text-xs text-muted mt-1">{search ? 'Try a different search term' : 'Logs will appear here as visitors check in'}</p>
          </div>
        ) : (
          <Table aria-label="Admin logs table">
            <TableHeader>
              <TableHead isRowHeader>Visitor</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Check-in</TableHead>
              <TableHead className="hidden lg:table-cell">Check-out</TableHead>
              <TableHead>Actions</TableHead>
            </TableHeader>
            <TableBody>
              {filtered.map(l => {
                const isIn = !l.checkoutAt
                return (
                  <TableRow key={l._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-semibold text-foreground">
                          {(l.visitorName ?? '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground">{l.visitorName ?? 'Unknown visitor'}</p>
                          <p className="text-xs text-muted mt-0.5 truncate max-w-[200px] md:hidden">{l.locationPath ?? l.locationName ?? 'Unknown location'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-sm text-foreground truncate max-w-[260px]" title={l.locationPath ?? undefined}>
                        {l.locationName ?? <span className="text-muted/60">Unknown</span>}
                      </p>
                      {l.locationPath && l.locationPath !== l.locationName && (
                        <p className="text-xs text-muted truncate max-w-[260px]">{l.locationPath}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full text-foreground bg-muted">
                        {l.locationType}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isIn ? (
                        // Outlined, not solid-filled: a solid bg-foreground
                        // pill is the exact same recipe as a primary action
                        // button (see Button's default variant), which made
                        // "In" and "Add Building" indistinguishable at a
                        // glance. The dot stays solid — it alone carries the
                        // "something is live" read a status pill needs.
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground border border-foreground/40 px-2.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 bg-foreground rounded-full animate-pulse" />
                          In
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-medium text-muted bg-muted px-2.5 py-0.5 rounded-full">
                          Out
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-xs text-muted">{new Date(l.timestamp).toLocaleString()}</p>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-xs text-muted">
                        {l.checkoutAt ? new Date(l.checkoutAt).toLocaleString() : '—'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`View details for ${l.visitorName ?? 'log'}`}
                          onClick={() => setSelectedLog(l)}
                        >
                          <EyeIcon className="h-4 w-4" aria-hidden />
                        </Button>
                        {isIn && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Manually check out ${l.visitorName ?? 'visitor'}`}
                            onClick={() => openManualCheckout(l)}
                          >
                            <LogOut className="h-3.5 w-3.5" aria-hidden />
                            Check out
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
      <LogDetailsDialog
        log={selectedLog}
        open={selectedLog !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedLog(null)
        }}
      />
      <Dialog
        open={manualCheckoutLog !== null}
        onOpenChange={(open) => {
          if (!open && !manualCheckoutLoading) {
            setManualCheckoutLog(null)
            setManualCheckoutReason('')
          }
        }}
      >
        <DialogContent size="sm" className="bg-overlay">
          <DialogHeader className="px-5 pt-5 sm:px-6 sm:pt-6">
            <DialogTitle className="text-base font-semibold text-foreground">Manual checkout</DialogTitle>
          </DialogHeader>
          <DialogBody className="px-5 pb-2 pt-0 sm:px-6">
            <div className="space-y-3">
              <p className="text-sm text-muted">
                This will append a checkout log for {manualCheckoutLog?.visitorName ?? 'this visitor'} and record the reason in the audit ledger.
              </p>
              <Textarea
                placeholder="Reason for manual checkout"
                value={manualCheckoutReason}
                disabled={manualCheckoutLoading}
                onChange={(event) => setManualCheckoutReason(event.target.value)}
                rows={4}
              />
            </div>
          </DialogBody>
          <DialogFooter className="flex justify-end gap-2 px-5 pb-5 pt-3 sm:px-6 sm:pb-6">
            <Button
              type="button"
              variant="outline"
              disabled={manualCheckoutLoading}
              onClick={() => {
                setManualCheckoutLog(null)
                setManualCheckoutReason('')
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={manualCheckoutLoading}
              onClick={submitManualCheckout}
            >
              {manualCheckoutLoading ? 'Checking out…' : 'Check out manually'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


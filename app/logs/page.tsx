'use client'

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ClipboardList, EyeIcon, MapPin, RefreshCw, TriangleAlert, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fetchJsonOnce } from '@/lib/clientFetch'
import { useLogRealtime } from '@/lib/useLogRealtime'

interface LogEntry {
  _id: string
  locationId: string
  locationType: string
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
  action: string
  timestamp: string
  checkoutAt?: string
  checkoutLog?: {
    _id?: string
    timestamp?: string
    autoCheckedOut?: boolean
  } | null
}

function formatValue(value?: string | boolean | null) {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return value
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

function detailDurationLabel(entry: LogEntry) {
  if (!entry.checkoutAt) return 'Still checked in'
  const ms = new Date(entry.checkoutAt).getTime() - new Date(entry.timestamp).getTime()
  const minutes = Math.max(0, Math.round(ms / 60000))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours ? `${hours}h ${rest}m` : `${rest}m`
}

// `full` spans both grid columns once the dialog is wide enough to run two —
// for values that run long (paths, emails, free text, ids) where a half-width
// cell would wrap or crowd its neighbor.
function DetailItem({ label, value, full }: { label: string; value?: string | boolean | null; full?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl bg-muted/40 px-3 py-2 ${full ? '@sm:col-span-2' : ''}`}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 break-words text-sm leading-5 text-foreground">{formatValue(value)}</p>
    </div>
  )
}

// @sm here reacts to the dialog's own rendered width (via the @container on
// its body), not the page viewport — at the dialog's mobile width the fields
// stay single-column exactly as before; once the dialog itself has room
// (tablet/desktop), short label/value pairs pair up instead of running one
// per row all the way down what used to be several screens of scrolling.
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-2 @sm:grid-cols-2">{children}</div>
    </section>
  )
}

// Raw request/device metadata is real, but it's not what a staff member came
// to their own history for — collapsed by default so it stays available
// without competing with Visitor/Location/Duration for attention.
function TechnicalDetails({ children }: { children: React.ReactNode }) {
  return (
    <details className="group space-y-2.5">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" aria-hidden />
        Technical details
      </summary>
      <div className="grid grid-cols-1 gap-2 pt-2.5 @sm:grid-cols-2">{children}</div>
    </details>
  )
}

function LogDetailsDialog({ log, open, onOpenChange }: { log: LogEntry | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!log) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The dialog used to cap its content at a 282px mobile-card width no
          matter the viewport, forcing every field onto its own row and
          turning one log into several screens of scrolling on a desktop with
          a thousand idle pixels beside it. It now grows with the page
          (sm/lg breakpoints below), and @container lets the field grid react
          to the dialog's own resolved width rather than the page's. */}
      <DialogContent size="sm" className="overflow-hidden bg-overlay sm:max-w-lg lg:max-w-xl [&>div]:flex [&>div]:max-h-[calc(100dvh-2rem)] [&>div]:min-h-0 [&>div]:flex-col">
        <div className="p-5 pb-4 sm:p-6 sm:pb-4">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl gradient-primary text-white shadow-sm shadow-cyan-200">
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
        <DialogBody className="@container min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-0 sm:px-6 sm:pb-6">
          <div className="w-full space-y-4">
            <DetailSection title="Visitor">
              <DetailItem label="Name" value={log.visitorName} />
              <DetailItem label="Email" value={log.visitorEmail} full />
              <DetailItem label="Phone" value={log.visitorPhone} />
              <DetailItem label="Gender" value={log.visitorGender} />
              <DetailItem label="Purpose" value={log.visitPurpose} full />
            </DetailSection>

            <DetailSection title="Location">
              <DetailItem label="Name" value={log.locationName} />
              <DetailItem label="Type" value={log.locationType} />
              <DetailItem label="Path" value={log.locationPath} full />
            </DetailSection>

            <DetailSection title="Check-in / Check-out">
              <DetailItem label="Check-in" value={formatDate(log.timestamp)} />
              <DetailItem label="Check-out" value={formatDate(log.checkoutAt)} />
              <DetailItem label="Duration" value={detailDurationLabel(log)} />
              <DetailItem label="Passkey verified" value={log.passkeyVerified} />
              {(log.checkoutLog?.autoCheckedOut ?? log.autoCheckedOut) && (
                <div className="min-w-0 rounded-xl bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/25 px-3 py-2 @sm:col-span-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--status-warning)]">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                    Auto checked out
                  </p>
                  <p className="mt-1 text-sm leading-5 text-foreground">
                    You didn&apos;t check out — the system closed this visit automatically after 12 hours.
                  </p>
                </div>
              )}
            </DetailSection>

            <TechnicalDetails>
              <DetailItem label="Location ID" value={log.locationId} />
              <DetailItem label="Checkout log ID" value={log.checkoutLog?._id} />
              <DetailItem label="IP address" value={log.ipAddress} />
              <DetailItem label="Geofence matched" value={log.geofenceStatus} />
              <DetailItem label="Session token" value={log.sessionToken} full />
              <DetailItem label="Device ID" value={log.deviceId} full />
              <DetailItem label="User agent" value={log.userAgent} full />
            </TechnicalDetails>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const fetchLogs = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)

    try {
      // scope=mine always resolves to the caller's own check-ins, even for a
      // team admin/owner who would otherwise get the team-wide view — that
      // wider scope belongs to /admin/logs, not a page titled "My Logs".
      const data = await fetchJsonOnce<{ logs?: LogEntry[] }>('/api/logs?scope=mine')
      setLogs(data.logs ?? [])
      setError(false)
    } catch {
      setError(true)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchLogs() }, [fetchLogs])
  useLogRealtime(() => { void fetchLogs(false) })

  function durationLabel(entry: LogEntry) {
    if (!entry.checkoutAt) return null
    const ms = new Date(entry.checkoutAt).getTime() - new Date(entry.timestamp).getTime()
    const minutes = Math.max(0, Math.round(ms / 60000))
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return hours ? `${hours}h ${rest}m` : `${rest}m`
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">My Logs</h1>
        {loading ? (
          <Skeleton className="mt-1.5 h-4 w-32" />
        ) : (
          <p className="text-sm text-muted mt-0.5">{logs.length} check-in{logs.length !== 1 ? 's' : ''} total</p>
        )}
      </div>

      <div>
        {loading ? (
          <Table aria-label="My logs loading table">
            <TableHeader>
              <TableHead isRowHeader>Visitor</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">When</TableHead>
              <TableHead>Details</TableHead>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 rounded-full" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--status-warning)]/10 flex items-center justify-center mb-3">
              <TriangleAlert className="w-6 h-6 text-[var(--status-warning)]" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">Couldn&apos;t load your logs</p>
            <p className="text-xs text-muted mt-1">Something went wrong fetching your check-in history.</p>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { void fetchLogs() }}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <ClipboardList className="w-6 h-6 text-foreground" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">No logs yet</p>
            <p className="text-xs text-muted mt-1">Your check-in history will appear here</p>
          </div>
        ) : (
          <Table aria-label="My logs table">
            <TableHeader>
              <TableHead isRowHeader>Visitor</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">When</TableHead>
              <TableHead>Details</TableHead>
            </TableHeader>
            <TableBody>
              {logs.map(l => {
                const dur = durationLabel(l)
                return (
                  <TableRow key={l._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0 text-xs font-semibold text-accent-foreground">
                          {(l.visitorName ?? '?')[0].toUpperCase()}
                        </div>
                        <p className="font-medium text-sm text-foreground">{l.visitorName ?? 'Unknown'}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-foreground truncate max-w-[220px]" title={l.locationPath ?? undefined}>
                        {l.locationName ?? <span className="text-muted/60">Unknown</span>}
                      </p>
                      {l.locationPath && l.locationPath !== l.locationName && (
                        <p className="text-xs text-muted truncate max-w-[220px]">{l.locationPath}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full text-foreground bg-muted">
                        {l.locationType}
                      </span>
                    </TableCell>
                    <TableCell>
                      {!l.checkoutAt ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--status-success)] bg-[var(--status-success)]/10 px-2.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 bg-[var(--status-success)] rounded-full animate-pulse" />
                          In
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted bg-muted px-2.5 py-0.5 rounded-full">
                          {dur ? `${dur}` : 'Out'}
                          {(l.checkoutLog?.autoCheckedOut ?? l.autoCheckedOut) && (
                            <span title="Automatically checked out after 12 hours">
                              <TriangleAlert className="size-3 text-[var(--status-warning)]" aria-hidden />
                            </span>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-xs text-muted">{new Date(l.timestamp).toLocaleString()}</p>
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`View details for ${l.visitorName ?? 'log'}`}
                        title="View details"
                        onClick={() => setSelectedLog(l)}
                      >
                        <EyeIcon className="h-4 w-4" aria-hidden />
                      </Button>
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
    </div>
  )
}

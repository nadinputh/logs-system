'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, EyeIcon, MapPin, UserRound } from 'lucide-react'
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
              <DetailItem label="Duration" value={detailDurationLabel(log)} />
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

  function durationLabel(entry: LogEntry) {
    if (!entry.checkoutAt) return null
    const ms = new Date(entry.checkoutAt).getTime() - new Date(entry.timestamp).getTime()
    const m = Math.round(ms / 60000)
    return `${m}m`
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
                        <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center shrink-0 text-xs font-semibold text-accent">
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
                        <span className="inline-flex items-center text-xs font-medium text-muted bg-muted px-2.5 py-0.5 rounded-full">
                          {dur ? `${dur}` : 'Out'}
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

'use client'

import { useEffect, useState, useCallback } from 'react'
import { EyeIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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
}

function formatValue(value?: string | boolean | null) {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return value
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
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
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm text-foreground">{formatValue(value)}</p>
    </div>
  )
}

function LogDetailsDialog({ log, open, onOpenChange }: { log: LogEntry | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!log) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="flex max-h-[calc(100dvh-2rem)] max-w-3xl flex-col overflow-hidden [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col">
        <DialogHeader>
          <DialogTitle>Log details</DialogTitle>
        </DialogHeader>
        <DialogBody className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Visitor</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Name" value={log.visitorName} />
              <DetailItem label="Email" value={log.visitorEmail} />
              <DetailItem label="Phone" value={log.visitorPhone} />
              <DetailItem label="Gender" value={log.visitorGender} />
              <DetailItem label="Purpose" value={log.visitPurpose} />
              <DetailItem label="Session token" value={log.sessionToken} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Location</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Name" value={log.locationName} />
              <DetailItem label="Path" value={log.locationPath} />
              <DetailItem label="Type" value={log.locationType} />
              <DetailItem label="Location ID" value={log.locationId} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Check-in / Check-out</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Check-in" value={formatDate(log.timestamp)} />
              <DetailItem label="Check-out" value={formatDate(log.checkoutAt)} />
              <DetailItem label="Duration" value={durationLabel(log)} />
              <DetailItem label="Auto checked out" value={log.checkoutLog?.autoCheckedOut ?? log.autoCheckedOut} />
              <DetailItem label="Passkey verified" value={log.passkeyVerified} />
              <DetailItem label="Checkout log ID" value={log.checkoutLog?._id} />
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Request context</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <DetailItem label="Device ID" value={log.deviceId} />
              <DetailItem label="IP address" value={log.ipAddress} />
              <DetailItem label="Geofence matched" value={log.geofenceStatus} />
              <DetailItem label="User agent" value={log.userAgent} />
            </div>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchLogs = useCallback(() => {
    setLoading(true)
    fetch('/api/logs')
      .then(r => r.json())
      .then(d => { setLogs(d.logs ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const filtered = logs.filter(l =>
    !search || (l.visitorName ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const locationTypeColors: Record<string, string> = {
    room: 'text-sky-600 bg-sky-50',
    floor: 'text-cyan-600 bg-cyan-50',
    building: 'text-amber-600 bg-amber-50',
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">All Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{logs.length} entries total</p>
        </div>
        <Button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          variant="outline"
          size="sm"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
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
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-6 h-6 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-muted-foreground">Loading logs…</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </div>
            <p className="font-medium text-foreground text-sm">{search ? 'No matching logs' : 'No logs yet'}</p>
            <p className="text-xs text-muted-foreground mt-1">{search ? 'Try a different search term' : 'Logs will appear here as visitors check in'}</p>
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
              <TableHead>Details</TableHead>
            </TableHeader>
            <TableBody>
              {filtered.map(l => {
                const typeKey = l.locationType?.toLowerCase() ?? ''
                const typeBadge = locationTypeColors[typeKey] ?? 'text-muted-foreground bg-muted'
                const isIn = !l.checkoutAt
                return (
                  <TableRow key={l._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent/20 to-cyan-600/20 flex items-center justify-center shrink-0 text-xs font-semibold text-accent">
                          {(l.visitorName ?? '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground">{l.visitorName ?? 'Unknown visitor'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px] md:hidden">{l.locationPath ?? l.locationName ?? 'Unknown location'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <p className="text-sm text-foreground truncate max-w-[260px]" title={l.locationPath ?? undefined}>
                        {l.locationName ?? <span className="text-muted-foreground/60">Unknown</span>}
                      </p>
                      {l.locationPath && l.locationPath !== l.locationName && (
                        <p className="text-xs text-muted-foreground truncate max-w-[260px]">{l.locationPath}</p>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${typeBadge}`}>
                        {l.locationType}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isIn ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          In
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-medium text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
                          Out
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-xs text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</p>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <p className="text-xs text-muted-foreground">
                        {l.checkoutAt ? new Date(l.checkoutAt).toLocaleString() : '—'}
                      </p>
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


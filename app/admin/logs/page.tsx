'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronDown, Download, EyeIcon, LogOut, MapPin, RefreshCw, Search, ShieldCheck, TriangleAlert, UserRound, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/sonner'
import { fetchJsonOnce, readApiError } from '@/lib/clientFetch'
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

// A cell starting with =, +, -, @, or a tab/CR is a live formula to Excel/
// Sheets on open — and several exported columns (Purpose, User agent, Device
// ID) are client-supplied free text. Prefixing with a bare quote forces
// text interpretation without changing what the cell displays.
const CSV_FORMULA_TRIGGER = /^[=+\-@\t\r]/

function csvEscape(value: unknown) {
  let text = String(value ?? '')
  if (CSV_FORMULA_TRIGGER.test(text)) text = `'${text}`
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

function csvBool(value?: boolean) {
  return value === undefined || value === null ? '' : value ? 'Yes' : 'No'
}

function durationLabel(entry: LogEntry) {
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

// Raw identifiers (Location ID, Checkout log ID, Session token, device/IP/UA)
// read at the same visual weight as Status/Duration, which flattens the
// dialog into an undifferentiated data dump. Collapsed by default so the
// facts an admin actually scans for aren't competing with ones they rarely need.
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
              <DetailItem label="Duration" value={durationLabel(log)} />
              <DetailItem label="Passkey verified" value={log.passkeyVerified} />
              {(log.checkoutLog?.autoCheckedOut ?? log.autoCheckedOut) && (
                <div className="min-w-0 rounded-xl bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/25 px-3 py-2 @sm:col-span-2">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--status-warning)]">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                    Auto checked out
                  </p>
                  <p className="mt-1 text-sm leading-5 text-foreground">
                    Nobody checked out — the system closed this visit automatically after 12 hours.
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

            {/* The ledger is append-only, so a correction never overwrites
                this log — but Product Principle 1 requires it be surfaced,
                never silent. Only rendered when a correction actually
                exists, so an ordinary, uncorrected log stays exactly as
                terse as it was before this section existed. Corrections are
                read as a timeline, not compact fields, so this section stays
                single-column even where its siblings now pair up. */}
            {!!log.corrections?.length && (
              <section className="space-y-2.5">
                <h2 className="text-sm font-semibold text-foreground">Correction</h2>
                <div className="grid gap-2">
                  {log.corrections.map((c, i) => (
                    <div key={i} className="min-w-0 rounded-xl bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/25 px-3 py-2">
                      <p className="text-xs font-medium text-[var(--status-warning)]">
                        {CORRECTION_FIELD_LABELS[c.field] ?? c.field} · {formatDate(c.timestamp)}
                      </p>
                      <p className="mt-1 break-words text-sm leading-5 text-foreground">{c.reasonForChange}</p>
                      <p className="mt-1 text-xs text-muted">By {c.modifiedByName ?? 'Unknown user'}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

const PAGE_SIZE = 50
const EXPORT_LIMIT = 5000

function AdminLogsContent() {
  // Top Locations on the dashboard links here with ?locationId=... so a click
  // lands pre-filtered instead of making the admin re-navigate and rebuild
  // the filter by hand.
  const searchParams = useSearchParams()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [manualCheckoutLog, setManualCheckoutLog] = useState<LogEntry | null>(null)
  const [manualCheckoutReason, setManualCheckoutReason] = useState('')
  const [manualCheckoutLoading, setManualCheckoutLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'in' | 'out'>('all')
  const [locationFilter, setLocationFilter] = useState(() => searchParams.get('locationId') ?? 'all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [locations, setLocations] = useState<{ id: string; label: string }[]>([])
  const [page, setPage] = useState(1)
  const [pageCount, setPageCount] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState(false)

  // Typing shouldn't fire a request per keystroke; settle for 300ms first.
  // Resetting the page in the same batch as the debounced value (React 18
  // batches both) means fetchLogs' dependencies change once, not twice — a
  // separate "reset page on filter change" effect would fire a wasted fetch
  // at the old page before the corrected one landed.
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  function buildLogsParams(overrides: { page?: number; limit?: number } = {}) {
    const params = new URLSearchParams({ page: String(overrides.page ?? page), limit: String(overrides.limit ?? PAGE_SIZE) })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (locationFilter !== 'all') params.set('locationId', locationFilter)
    if (dateFrom) params.set('from', dateFrom)
    if (dateTo) params.set('to', dateTo)
    return params
  }

  const fetchLogs = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)

    try {
      const data = await fetchJsonOnce<{ logs?: LogEntry[]; total?: number; pages?: number; distinctLocations?: { id: string; label: string }[] }>(
        `/api/logs?${buildLogsParams()}`
      )
      setLogs(data.logs ?? [])
      setTotalCount(data.total ?? 0)
      setPageCount(Math.max(1, data.pages ?? 1))
      if (data.distinctLocations) setLocations(data.distinctLocations)
      setError(false)
      // A filter change (or a realtime deletion) can leave `page` past the
      // new last page — land on the last real page instead of an empty one.
      const lastPage = Math.max(1, data.pages ?? 1)
      if (page > lastPage) setPage(lastPage)
    } catch {
      setError(true)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [page, debouncedSearch, statusFilter, locationFilter, dateFrom, dateTo])

  useEffect(() => { void fetchLogs() }, [fetchLogs])
  useLogRealtime(() => { void fetchLogs(false) })

  const hasActiveFilters = !!search || statusFilter !== 'all' || locationFilter !== 'all' || !!dateFrom || !!dateTo

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setLocationFilter('all')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  async function exportCsv() {
    setExporting(true)
    try {
      const data = await fetchJsonOnce<{ logs?: LogEntry[] }>(`/api/logs?${buildLogsParams({ page: 1, limit: EXPORT_LIMIT })}`)
      const rows = data.logs ?? []
      // Mirrors LogDetailsDialog's own section order (Visitor → Location →
      // Check-in/out → Technical details) so the export reads the same way
      // the dialog does — this is all data the row already fetched for the
      // dialog, just never surfaced in the CSV.
      const headers = [
        'Visitor', 'Email', 'Phone', 'Gender', 'Purpose',
        'Location', 'Type', 'Status', 'Check-in', 'Check-out', 'Duration',
        'Passkey Verified', 'Auto Checked Out',
        'Device ID', 'IP Address', 'Geofence Matched', 'User Agent',
        'Corrected',
      ]
      const csvRows = rows.map(l => [
        l.visitorName ?? '',
        l.visitorEmail ?? '',
        l.visitorPhone ?? '',
        l.visitorGender ?? '',
        l.visitPurpose ?? '',
        l.locationPath ?? l.locationName ?? '',
        l.locationType,
        l.checkoutAt ? 'Out' : 'In',
        formatDate(l.timestamp),
        formatDate(l.checkoutAt),
        durationLabel(l),
        csvBool(l.passkeyVerified),
        csvBool(l.checkoutLog?.autoCheckedOut ?? l.autoCheckedOut),
        l.deviceId ?? '',
        l.ipAddress ?? '',
        csvBool(l.geofenceStatus),
        l.userAgent ?? '',
        l.corrections?.length ? 'Yes' : 'No',
      ])
      const csv = [headers, ...csvRows].map(row => row.map(csvEscape).join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `logs-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Export failed — could not fetch logs')
    } finally {
      setExporting(false)
    }
  }

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
            <p className="text-sm text-muted mt-0.5" aria-live="polite">
              {totalCount} {totalCount === 1 ? 'entry' : 'entries'} total
              {pageCount > 1 && ` · page ${page} of ${pageCount}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={exportCsv}
            disabled={loading || exporting || totalCount === 0}
            variant="outline"
            size="sm"
          >
            <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} aria-hidden />
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
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
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/60" aria-hidden />
          <Input
            placeholder="Filter by visitor name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-2 text-muted/60 hover:text-foreground"
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          )}
        </div>
        <Select
          value={statusFilter}
          onValueChange={v => { setStatusFilter((v as 'all' | 'in' | 'out') ?? 'all'); setPage(1) }}
          fullWidth={false}
        >
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="in">Currently in</SelectItem>
            <SelectItem value="out">Checked out</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={locationFilter}
          onValueChange={v => { setLocationFilter(v ?? 'all'); setPage(1) }}
          fullWidth={false}
        >
          <SelectTrigger className="w-48"><SelectValue placeholder="Location" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map(loc => (
              <SelectItem key={loc.id} value={loc.id}>{loc.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input
            id="checkin-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={e => { setDateFrom(e.target.value); setPage(1) }}
            className="w-[9.5rem]"
            aria-label="Check-in from"
          />
          <span className="text-xs text-muted" aria-hidden>to</span>
          <Input
            id="checkin-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={e => { setDateTo(e.target.value); setPage(1) }}
            className="w-[9.5rem]"
            aria-label="Check-in to"
          />
        </div>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="ml-1 border-l border-border pl-3 py-2 text-xs font-medium text-muted hover:text-foreground underline underline-offset-2"
          >
            Clear filters
          </button>
        )}
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
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--status-warning)]/10 flex items-center justify-center mb-3">
              <TriangleAlert className="w-6 h-6 text-[var(--status-warning)]" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">Couldn&apos;t load logs</p>
            <p className="text-xs text-muted mt-1">Something went wrong fetching the audit log — this isn&apos;t the same as an empty ledger.</p>
            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { void fetchLogs() }}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Try again
            </Button>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <ShieldCheck className="w-6 h-6 text-muted/50" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">{hasActiveFilters ? 'No matching logs' : 'No logs yet'}</p>
            <p className="text-xs text-muted mt-1">{hasActiveFilters ? 'Try different filters' : 'Logs will appear here as visitors check in'}</p>
            {hasActiveFilters && (
              <Button type="button" variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
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
              {logs.map(l => {
                const isIn = !l.checkoutAt
                return (
                  <TableRow key={l._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-xs font-semibold text-foreground">
                          {(l.visitorName ?? '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-sm text-foreground truncate">{l.visitorName ?? 'Unknown visitor'}</p>
                            {!!l.corrections?.length && (
                              <span
                                title={`${l.corrections.length} correction${l.corrections.length !== 1 ? 's' : ''} on this log — see Guest Details`}
                                className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--status-warning)] bg-[var(--status-warning)]/10 px-1.5 py-0.5 rounded-full"
                              >
                                <TriangleAlert className="size-3" aria-hidden />
                                Corrected
                              </span>
                            )}
                          </div>
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
                          title="View details"
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

      {!loading && !error && pageCount > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-muted">Page {page} of {pageCount}</p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
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

export default function AdminLogsPage() {
  return <Suspense><AdminLogsContent /></Suspense>
}


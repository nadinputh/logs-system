'use client'

import { useEffect, useState, useCallback } from 'react'
import { Input } from '@/components/ui/input'

interface LogEntry {
  _id: string; locationId: string; locationType: string
  locationName?: string | null
  locationPath?: string | null
  visitorName?: string; timestamp: string; checkoutAt?: string
}

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
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
    room: 'text-indigo-600 bg-indigo-50',
    floor: 'text-violet-600 bg-violet-50',
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
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-white border border-border/60 hover:border-border hover:bg-muted/30 px-3.5 py-2 rounded-xl transition-all disabled:opacity-50 shadow-sm"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
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
      <div className="bg-white rounded-2xl border border-border/60 shadow-sm shadow-black/[0.04] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <svg className="w-6 h-6 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
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
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visitor</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Location</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Type</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Check-in</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Check-out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map(l => {
                const typeKey = l.locationType?.toLowerCase() ?? ''
                const typeBadge = locationTypeColors[typeKey] ?? 'text-muted-foreground bg-muted'
                const isIn = !l.checkoutAt
                return (
                  <tr key={l._id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
                          {(l.visitorName ?? '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground">{l.visitorName ?? 'Unknown visitor'}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px] md:hidden">{l.locationPath ?? l.locationName ?? 'Unknown location'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <p className="text-sm text-foreground truncate max-w-[260px]" title={l.locationPath ?? undefined}>
                        {l.locationName ?? <span className="text-muted-foreground/60">Unknown</span>}
                      </p>
                      {l.locationPath && l.locationPath !== l.locationName && (
                        <p className="text-xs text-muted-foreground truncate max-w-[260px]">{l.locationPath}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${typeBadge}`}>
                        {l.locationType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
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
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <p className="text-xs text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</p>
                    </td>
                    <td className="px-6 py-4 hidden lg:table-cell">
                      <p className="text-xs text-muted-foreground">
                        {l.checkoutAt ? new Date(l.checkoutAt).toLocaleString() : '—'}
                      </p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}


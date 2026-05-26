'use client'

import { useEffect, useState } from 'react'

interface LogEntry {
  _id: string
  locationId: string
  locationType: string
  locationName?: string | null
  locationPath?: string | null
  visitorName?: string
  action: string
  timestamp: string
  checkoutAt?: string
}

const typeColors: Record<string, string> = {
  room: 'text-indigo-600 bg-indigo-50',
  floor: 'text-violet-600 bg-violet-50',
  building: 'text-amber-600 bg-amber-50',
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/logs')
      .then(r => r.json())
      .then(data => { setLogs(data.logs ?? []); setLoading(false) })
  }, [])

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
        <p className="text-sm text-muted-foreground mt-0.5">{logs.length} check-in{logs.length !== 1 ? 's' : ''} total</p>
      </div>

      <div className="bg-white rounded-2xl border border-border/60 shadow-sm shadow-black/[0.04] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <svg className="w-6 h-6 text-primary animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="font-medium text-foreground text-sm">No logs yet</p>
            <p className="text-xs text-muted-foreground mt-1">Your check-in history will appear here</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visitor</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Type</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {logs.map(l => {
                const typeKey = l.locationType?.toLowerCase() ?? ''
                const typeBadge = typeColors[typeKey] ?? 'text-muted-foreground bg-muted'
                const dur = durationLabel(l)
                return (
                  <tr key={l._id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-violet-500/20 flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
                          {(l.visitorName ?? '?')[0].toUpperCase()}
                        </div>
                        <p className="font-medium text-sm text-foreground">{l.visitorName ?? 'Unknown'}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-foreground truncate max-w-[220px]" title={l.locationPath ?? undefined}>
                        {l.locationName ?? <span className="text-muted-foreground/60">Unknown</span>}
                      </p>
                      {l.locationPath && l.locationPath !== l.locationName && (
                        <p className="text-xs text-muted-foreground truncate max-w-[220px]">{l.locationPath}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell">
                      <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${typeBadge}`}>
                        {l.locationType}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {!l.checkoutAt ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                          In
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-medium text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
                          {dur ? `${dur}` : 'Out'}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</p>
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

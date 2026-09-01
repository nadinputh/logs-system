'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, TriangleAlert } from 'lucide-react'
import { fetchJsonOnce } from '@/lib/clientFetch'
import { useLogRealtime } from '@/lib/useLogRealtime'

interface Stats { totalToday: number; currentlyIn: number }

interface CountPoint {
  label: string
  count: number
}

interface DailyPoint extends CountPoint {
  date: string
  // Check-ins from this day with no matching checkout yet. For today this is
  // the live "still on-site" count; for any earlier day it should read ~0 —
  // the nightly 12h auto-checkout should have resolved everything by then,
  // so a non-zero value on a past day is a stuck log, not a status update.
  stillOpen: number
}

interface TopLocationPoint extends CountPoint {
  locationId: string
  locationType: string
  name: string
  path?: string | null
  stillIn: number
}

interface DashboardMetrics {
  stats: Stats
  daily: DailyPoint[]
  topLocations: TopLocationPoint[]
}

const emptyStats: Stats = { totalToday: 0, currentlyIn: 0 }

const emptyMetrics: DashboardMetrics = {
  stats: emptyStats,
  daily: [],
  topLocations: [],
}

function maxCount(items: CountPoint[]) {
  return Math.max(1, ...items.map(item => item.count))
}

function hasCounts(items: CountPoint[]) {
  return items.some(item => item.count > 0)
}

// Screen-reader alternative for the chart: the bars are aria-hidden, so this
// carries the full dataset as a proper table for assistive tech.
function ChartDataTable({ caption, rows }: { caption: string; rows: { label: string; count: number; stillOpen: number }[] }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Day</th>
          <th scope="col">Check-ins</th>
          <th scope="col">Still open</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.count}</td>
            <td>{row.stillOpen}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WeeklyTrendChart({ data, loading }: { data: DailyPoint[]; loading: boolean }) {
  const max = maxCount(data)
  const hasData = hasCounts(data)
  // The server always returns exactly 7 days, oldest first — today is
  // guaranteed to be the last entry by construction. Comparing against an
  // independently-computed "today" (as a previous version did) meant client
  // clock/timezone and server timezone had to agree exactly; this needs no
  // date math on the client at all.
  const todayIndex = data.length - 1
  const todayStillOpen = data[todayIndex]?.stillOpen ?? 0
  // Still-open on any day *before* today means a check-in outlived the 12h
  // auto-checkout — a stuck record, not a status update (see the API route).
  const staleCount = data.slice(0, todayIndex).reduce((sum, item) => sum + item.stillOpen, 0)

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Check-ins This Week</h2>
            <p className="text-xs text-muted mt-1">Daily volume, resolved vs. still open</p>
          </div>
          {/* Only the swatches that actually appear in this week's data — an
              all-resolved week shows no legend at all. Stacks below the title
              under sm: at phone widths the legend's own min-content width
              (~286px) doesn't fit beside a title, so sharing one row was
              crushing the title into a one-word-per-line wrap and pushing
              "Needs review" off the edge of the viewport (verified via
              /impeccable audit — a WCAG 1.4.10 Reflow failure, not cosmetic). */}
          {!loading && (todayStillOpen > 0 || staleCount > 0) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted sm:shrink-0 sm:justify-end">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent" aria-hidden />
                Resolved
              </span>
              {todayStillOpen > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
                  Checked in now
                </span>
              )}
              {staleCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-500" aria-hidden />
                  Needs review
                </span>
              )}
            </div>
          )}
        </div>
        {/* Visible, always-on — not just a hover tooltip — since this is the
            one thing on the dashboard that answers "is the ledger healthy." */}
        {!loading && staleCount > 0 && (
          <Link
            href="/admin/logs?status=in"
            className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300 outline-none transition-colors hover:bg-amber-500/15 focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
            {staleCount} check-in{staleCount !== 1 ? 's' : ''} from earlier this week {staleCount !== 1 ? 'are' : 'is'} still open past auto-checkout — review
          </Link>
        )}
        {loading ? (
          <div className="h-44 rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />
        ) : hasData ? (
          <>
            <div className="overflow-x-auto px-1 pb-1" aria-hidden="true">
              {/* px-1 reserves room for the today-bar's ring-offset-2 bleed —
                  without it, the scroll container's own edge (which, per the
                  overflow-x:auto/overflow-y:auto coupling, clips like
                  overflow-hidden) crops the ring on whichever side sits flush
                  against it. Today is always the last bar, so this only ever
                  showed up on the right (verified via /impeccable audit). */}
              <div className="min-w-[360px] h-44 flex items-end gap-2">
                {data.map((item, index) => {
                  const isToday = index === todayIndex
                  const totalHeight = item.count === 0 ? 0 : Math.max(8, Math.round((item.count / max) * 100))
                  const openShare = item.count === 0 ? 0 : item.stillOpen / item.count
                  const resolvedShare = 1 - openShare
                  const openNote = item.stillOpen === 0
                    ? ''
                    : isToday
                      ? `, ${item.stillOpen} still checked in`
                      : `, ${item.stillOpen} still open — check the log`
                  return (
                    <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                      <div
                        className={`flex h-32 w-full items-end rounded-lg bg-muted/60 px-1.5 ${isToday ? 'ring-2 ring-accent/40 ring-offset-2 ring-offset-background' : ''}`}
                      >
                        {/* Flat brand fill, not a gradient — DESIGN.md's gradient
                            only ever flows 135deg sky→cyan→teal on hero/CTA
                            surfaces; a per-bar vertical gradient here was a
                            second, inconsistent chromatic voice on the page.
                            Still-open is a status, not a volume, so it uses
                            DESIGN.md's own status tokens instead of a tint of
                            the brand hue: emerald for today (matches "Live"
                            elsewhere on this page), amber for any earlier
                            day (matches DESIGN.md's "stale-log candidates"). */}
                        <div
                          className="flex w-full flex-col overflow-hidden rounded-md transition-all"
                          style={{ height: `${totalHeight}%` }}
                          title={`${item.label}: ${item.count} check-ins${openNote}`}
                        >
                          {item.stillOpen > 0 && (
                            <div
                              className={`w-full ${isToday ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ height: `${openShare * 100}%` }}
                            />
                          )}
                          <div className="w-full bg-accent" style={{ height: `${resolvedShare * 100}%` }} />
                        </div>
                      </div>
                      <p className={`h-8 text-center text-xs leading-4 ${isToday ? 'font-semibold text-accent' : 'text-muted'}`}>
                        {item.label}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
            <ChartDataTable caption="Check-ins this week, by day, resolved vs. still open" rows={data} />
          </>
        ) : (
          <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
            No log data yet
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TopLocationsCard({ locations, loading }: { locations: TopLocationPoint[]; loading: boolean }) {
  const items = locations.map(location => ({ ...location, label: location.name }))
  const max = maxCount(items)

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Top Locations</h2>
          <p className="text-xs text-muted mt-1">Most visited places in the last 30 days</p>
        </div>
        {loading ? (
          <div className="space-y-3.5">
            {[0, 1, 2, 3].map(item => (
              <div key={item} className="h-14 rounded-xl bg-muted animate-pulse motion-reduce:animate-none" />
            ))}
          </div>
        ) : locations.length ? (
          // A ranked list, so an ordered one: the rank digit below is inside a
          // link whose aria-label overrides its contents, which means list
          // position is the only way the ranking reaches a screen reader.
          <ol className="space-y-3.5">
            {items.map((item, index) => {
              // The leader gets the same "leads and carries its own visual
              // weight" treatment as this page's own Right Now card
              // (border-accent/30 bg-accent/[0.06]) — with a >40x spread
              // between rank 1 and rank 5 typical in real data, every row
              // otherwise reads with identical weight and the squint test
              // never finds a leader (verified via /impeccable layout).
              // Only kicks in with something to lead over.
              const isLeader = index === 0 && items.length > 1
              // lib/locationLabels.ts builds `path` so it always ends with
              // `name` — a building's path *is* its name. Rendering both put a
              // literal duplicate under every building row ("Headquarters
              // Tower" twice), and on rooms the repeated tail ate the width
              // until the ancestors that actually add information truncated
              // away. Keep only the part the name doesn't already say.
              const context = item.path?.endsWith(item.name)
                ? item.path.slice(0, -item.name.length).replace(/\s*›\s*$/, '')
                : item.path ?? item.locationType
              return (
                <li key={item.locationId}>
                  <Link
                    href={`/admin/logs?locationId=${item.locationId}`}
                    aria-label={`View logs for ${item.name}, ${item.count} total, ${item.stillIn} still checked in`}
                    className={`grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2.5 rounded-xl outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/40 ${
                      isLeader
                        ? '-m-3 border border-accent/30 bg-accent/[0.06] p-3 hover:bg-accent/10'
                        // The transparent border is load-bearing: without it the
                        // leader's 1px border insets its content and its bar
                        // track by 1px, and the rank, name and count columns
                        // stop lining up with every row below it.
                        : '-m-2 border border-transparent p-2 hover:bg-muted/20'
                    }`}
                  >
                    {/* Rank is its own column, not a prefix glued onto the name:
                        as text it spent the name's truncation budget and the
                        digits never lined up. `.tabular` is this project's own
                        rule for digits in records (app/globals.css). */}
                    <span className={`tabular text-xs font-semibold leading-5 ${isLeader ? 'text-accent' : 'text-muted'}`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-baseline gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.name}</p>
                        {/* Only when someone is actually here. An emerald chip
                            reading "Still IN 0" spends the presence signal on
                            an absence — and on a five-row list it was most of
                            the ink. */}
                        {item.stillIn > 0 && (
                          <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                            Still IN {item.stillIn}
                          </span>
                        )}
                        {/* Rightmost, so the counts land in one column. */}
                        <span className="tabular shrink-0 text-sm font-semibold text-foreground">{item.count}</span>
                      </div>
                      {context && <p className="truncate text-xs text-muted">{context}</p>}
                      {/* Brand accent, not emerald — this bar's length encodes
                          30-day visit volume, a ranking signal, not live
                          presence. Emerald is reserved for "someone is here
                          right now" (the Still IN badge, the Right Now card);
                          reusing it here would blur that one signal across two
                          different meanings on the same page (DESIGN.md's
                          Status-Is-Not-Brand Rule; verified via /impeccable
                          layout). The track sits in the content column, so
                          every row's is the same width and the lengths stay
                          honestly comparable. */}
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, Math.round((item.count / max) * 100))}%` }} />
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ol>
        ) : (
          <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted">
            No location activity yet
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const refreshMetrics = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)

    try {
      const data = await fetchJsonOnce<Partial<DashboardMetrics> & { stats?: Partial<Stats> }>('/api/dashboard/metrics')
      setMetrics({ ...emptyMetrics, ...data, stats: { ...emptyStats, ...(data.stats ?? {}) } })
      setError(false)
    } catch {
      setError(true)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useEffect(() => { void refreshMetrics() }, [refreshMetrics])
  useLogRealtime(() => { void refreshMetrics(false) })

  const { stats } = metrics

  const firstName = session?.user?.name?.split(' ')[0] ?? session?.user?.email?.split('@')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {firstName}{' '}
            <span role="img" aria-label="waving hand">
              👋
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link
          href="/logs"
          className="flex items-center gap-1.5 rounded-full px-2 py-1.5 -mx-2 -my-1.5 text-sm font-medium text-accent outline-none transition-colors hover:text-accent/80 focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          View my logs
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[var(--status-warning)]/10 flex items-center justify-center mb-3">
            <TriangleAlert className="w-6 h-6 text-[var(--status-warning)]" strokeWidth={1.75} aria-hidden />
          </div>
          <p className="font-medium text-foreground text-sm">Couldn&apos;t load your overview</p>
          <p className="text-xs text-muted mt-1">This isn&apos;t the same as a quiet day — something went wrong fetching it.</p>
          <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => { void refreshMetrics() }}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Try again
          </Button>
        </div>
      ) : (
        <>
          {/* Currently Checked In leads and carries its own visual weight — it's
              the one number here with real operational stakes (who might
              still be on-site), not a peer of an ordinary volume count. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" aria-live="polite" aria-busy={loading}>
            <Card className="border-accent/30 bg-accent/[0.06]">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-accent">Right Now</p>
                  {!loading && stats.currentlyIn > 0 && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse motion-reduce:animate-none" />
                      Live
                    </span>
                  )}
                </div>
                {loading ? (
                  <div className="h-10 w-20 bg-muted rounded-lg animate-pulse motion-reduce:animate-none" />
                ) : (
                  <p className="text-4xl font-bold text-foreground tracking-tight">{stats.currentlyIn}</p>
                )}
                <p className="text-sm text-muted font-medium">Currently checked in</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted">Today</p>
                {loading ? (
                  <div className="h-10 w-20 bg-muted rounded-lg animate-pulse motion-reduce:animate-none" />
                ) : (
                  <p className="text-4xl font-bold text-foreground tracking-tight">{stats.totalToday}</p>
                )}
                <p className="text-sm text-muted font-medium">Check-ins today</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <WeeklyTrendChart data={metrics.daily} loading={loading} />
            <TopLocationsCard locations={metrics.topLocations} loading={loading} />
          </div>
        </>
      )}
    </div>
  )
}

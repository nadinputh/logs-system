'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Card, CardContent } from '@/components/ui/card'
import { fetchJsonOnce } from '@/lib/clientFetch'

interface Stats { totalToday: number; currentlyIn: number; totalAll: number; checkedOut: number }

interface CountPoint {
  label: string
  count: number
}

interface DailyPoint extends CountPoint {
  date: string
}

interface HourlyPoint extends CountPoint {
  hour: number
}

interface LocationTypePoint extends CountPoint {
  type: string
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
  hourlyToday: HourlyPoint[]
  locationTypeBreakdown: LocationTypePoint[]
  topLocations: TopLocationPoint[]
}

const emptyStats: Stats = { totalToday: 0, currentlyIn: 0, totalAll: 0, checkedOut: 0 }

const emptyMetrics: DashboardMetrics = {
  stats: emptyStats,
  daily: [],
  hourlyToday: [],
  locationTypeBreakdown: [],
  topLocations: [],
}

const typeAccents: Record<string, string> = {
  building: 'bg-amber-500',
  floor: 'bg-cyan-500',
  room: 'bg-sky-500',
}

function maxCount(items: CountPoint[]) {
  return Math.max(1, ...items.map(item => item.count))
}

function hasCounts(items: CountPoint[]) {
  return items.some(item => item.count > 0)
}

function VerticalBarChart({
  title,
  subtitle,
  data,
  loading,
  compact = false,
}: {
  title: string
  subtitle: string
  data: CountPoint[]
  loading: boolean
  compact?: boolean
}) {
  const max = maxCount(data)
  const hasData = hasCounts(data)

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        {loading ? (
          <div className="h-44 rounded-xl bg-muted animate-pulse" />
        ) : hasData ? (
          <div className="overflow-x-auto pb-1">
            <div className={`${compact ? 'min-w-[560px]' : 'min-w-[360px]'} h-44 flex items-end gap-2`}>
              {data.map(item => {
                const height = item.count === 0 ? 0 : Math.max(8, Math.round((item.count / max) * 100))
                return (
                  <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="flex h-32 w-full items-end rounded-lg bg-muted/60 px-1.5">
                      <div
                        className="w-full rounded-md bg-gradient-to-t from-sky-600 to-cyan-400 transition-all"
                        style={{ height: `${height}%` }}
                        aria-label={`${item.label}: ${item.count} logs`}
                        title={`${item.label}: ${item.count} logs`}
                      />
                    </div>
                    <p className="h-8 text-center text-[11px] leading-4 text-muted-foreground">
                      {item.label}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            No log data yet
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProgressBreakdown({
  title,
  subtitle,
  items,
  loading,
  accentFor,
}: {
  title: string
  subtitle: string
  items: CountPoint[]
  loading: boolean
  accentFor?: (item: CountPoint) => string
}) {
  const max = maxCount(items)
  const hasData = hasCounts(items)

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map(item => (
              <div key={item} className="space-y-2">
                <div className="h-4 w-32 rounded bg-muted animate-pulse" />
                <div className="h-3 rounded-full bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : hasData ? (
          <div className="space-y-4">
            {items.map(item => {
              const width = item.count === 0 ? 0 : Math.max(4, Math.round((item.count / max) * 100))
              const accent = accentFor?.(item) ?? 'bg-emerald-500'
              return (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-sm font-semibold text-foreground">{item.count}</p>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full ${accent}`} style={{ width: `${width}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-36 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            No log data yet
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TopLocationsChart({
  locations,
  loading,
}: {
  locations: TopLocationPoint[]
  loading: boolean
}) {
  const items = locations.map(location => ({ ...location, label: location.name }))

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Top Locations</h3>
          <p className="text-xs text-muted-foreground mt-1">Most visited places in the last 30 days</p>
        </div>
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2, 3].map(item => (
              <div key={item} className="h-12 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : locations.length ? (
          <div className="space-y-4">
            {items.map((item, index) => {
              const max = maxCount(items)
              const width = Math.max(4, Math.round((item.count / max) * 100))
              return (
                <div key={item.locationId} className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {index + 1}. {item.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{item.path ?? item.locationType}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-foreground">
                        Total {item.count}
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700">
                        Still IN {item.stillIn}
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${width}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
            No location activity yet
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({
  label,
  value,
  loading,
  icon,
  accent,
  badge,
}: {
  label: string
  value: number
  loading: boolean
  icon: React.ReactNode
  accent: string
  badge?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accent}`}>
            {icon}
          </div>
          {badge}
        </div>
        <div>
          {loading ? (
            <div className="h-8 w-16 bg-muted rounded-lg animate-pulse" />
          ) : (
            <p className="text-3xl font-bold text-foreground tracking-tight">{value}</p>
          )}
          <p className="text-sm text-muted-foreground mt-1 font-medium">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

const quickActions = [
  {
    href: '/admin/buildings',
    label: 'Manage Buildings',
    description: 'Add or edit building locations',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    color: 'text-sky-600 bg-sky-50',
  },
  {
    href: '/admin/logs',
    label: 'View All Logs',
    description: 'Browse complete activity log',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
      </svg>
    ),
    color: 'text-cyan-600 bg-cyan-50',
  },
  {
    href: '/admin/quests',
    label: 'Quest Cards',
    description: 'Create and manage quest challenges',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    color: 'text-amber-600 bg-amber-50',
  },
]

export default function DashboardPage() {
  const { data: session } = useSession()
  const [metrics, setMetrics] = useState<DashboardMetrics>(emptyMetrics)
  const [loading, setLoading] = useState(true)
  const isAdmin = (session?.user as any)?.role === 'admin'

  useEffect(() => {
    fetchJsonOnce<Partial<DashboardMetrics> & { stats?: Partial<Stats> }>('/api/dashboard/metrics')
      .then(data => {
        setMetrics({ ...emptyMetrics, ...data, stats: { ...emptyStats, ...(data.stats ?? {}) } })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const { stats } = metrics
  const statusBreakdown = [
    { label: 'Checked out', count: stats.checkedOut },
    { label: 'Still checked in', count: stats.currentlyIn },
  ]

  const firstName = session?.user?.name?.split(' ')[0] ?? session?.user?.email?.split('@')[0] ?? 'there'
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}, {firstName} 👋
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Link
          href="/logs"
          className="flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent/80 transition-colors"
        >
          View my logs
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* Stats */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4">
          Today's Overview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Check-ins Today"
            value={stats.totalToday}
            loading={loading}
            accent="bg-sky-50 text-sky-600"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            }
          />
          <StatCard
            label="Currently Checked In"
            value={stats.currentlyIn}
            loading={loading}
            accent="bg-emerald-50 text-emerald-600"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
            badge={
              !loading && stats.currentlyIn > 0 ? (
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  Live
                </span>
              ) : undefined
            }
          />
          <StatCard
            label="Total All-Time Logs"
            value={stats.totalAll}
            loading={loading}
            accent="bg-cyan-50 text-cyan-600"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
        </div>
      </div>

      {/* Charts */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4">
          Log Analytics
        </h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <VerticalBarChart
            title="Check-ins Over Time"
            subtitle="Daily volume across the last 7 days"
            data={metrics.daily}
            loading={loading}
          />
          <VerticalBarChart
            title="Today's Activity"
            subtitle="Check-ins grouped by hour"
            data={metrics.hourlyToday}
            loading={loading}
            compact
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
            <ProgressBreakdown
              title="Location Type Mix"
              subtitle="Building, floor, and room check-ins over 30 days"
              items={metrics.locationTypeBreakdown}
              loading={loading}
              accentFor={(item) => typeAccents[(item as LocationTypePoint).type] ?? 'bg-muted-foreground'}
            />
            <ProgressBreakdown
              title="Completion Status"
              subtitle="All-time check-ins with linked check-out logs"
              items={statusBreakdown}
              loading={loading}
              accentFor={(item) => item.label === 'Still checked in' ? 'bg-emerald-500' : 'bg-slate-500'}
            />
          </div>
          <TopLocationsChart locations={metrics.topLocations} loading={loading} />
        </div>
      </div>

      {/* Quick Actions (admin only) */}
      {isAdmin && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {quickActions.map(action => (
              <Card key={action.href}>
                <CardContent className="p-4">
                  <Link href={action.href} className="group flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${action.color}`}>
                      {action.icon}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-foreground group-hover:text-accent transition-colors">
                        {action.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                    </div>
                    <svg className="w-4 h-4 text-muted-foreground/40 group-hover:text-accent/60 transition-colors ml-auto shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

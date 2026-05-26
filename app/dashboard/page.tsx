'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'

interface Stats { totalToday: number; currentlyIn: number; totalAll: number }

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
    <div className="bg-white rounded-2xl border border-border/60 p-6 shadow-sm shadow-black/[0.04] space-y-4 hover:shadow-md hover:shadow-black/[0.06] transition-shadow">
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
    </div>
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
    color: 'text-indigo-600 bg-indigo-50',
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
    color: 'text-violet-600 bg-violet-50',
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
  const [stats, setStats] = useState<Stats>({ totalToday: 0, currentlyIn: 0, totalAll: 0 })
  const [loading, setLoading] = useState(true)
  const isAdmin = (session?.user as any)?.role === 'admin'

  useEffect(() => {
    fetch('/api/logs?page=1')
      .then(r => r.json())
      .then(data => {
        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        const logs = data.logs ?? []
        const totalToday = logs.filter((l: any) => new Date(l.timestamp) >= todayStart).length
        const currentlyIn = logs.filter((l: any) => !l.checkoutAt).length
        setStats({ totalToday, currentlyIn, totalAll: data.total })
        setLoading(false)
      })
  }, [])

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
          className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
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
            accent="bg-indigo-50 text-indigo-600"
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
            accent="bg-violet-50 text-violet-600"
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
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
              <Link
                key={action.href}
                href={action.href}
                className="group bg-white rounded-2xl border border-border/60 p-5 shadow-sm shadow-black/[0.04] flex items-start gap-4 hover:shadow-md hover:shadow-black/[0.06] hover:border-primary/20 transition-all"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${action.color}`}>
                  {action.icon}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                    {action.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
                </div>
                <svg className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary/60 transition-colors ml-auto shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

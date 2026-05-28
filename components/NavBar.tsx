'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
  )},
  { href: '/logs', label: 'My Logs', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  )},
]

const locationItems = [
  { href: '/admin/buildings', label: 'Buildings', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
  )},
  { href: '/admin/floors', label: 'Floors', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
  )},
  { href: '/admin/rooms', label: 'Rooms', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
  )},
]

const adminItems = [
  { href: '/admin/quests', label: 'Quests', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
  )},
  { href: '/admin/logs', label: 'All Logs', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
  )},
]

export default function NavBar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isAdmin = (session?.user as any)?.role === 'admin'
  const userEmail = session?.user?.email ?? ''
  const initials = userEmail ? userEmail[0].toUpperCase() : '?'

  const [locOpen, setLocOpen] = useState(false)
  const locRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (locRef.current && !locRef.current.contains(e.target as Node)) {
        setLocOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isLocationActive = locationItems.some(i => pathname.startsWith(i.href))
  const navLinkBase = 'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap'
  const navLinkActive = 'bg-accent/10 text-accent'
  const navLinkInactive = 'text-muted-foreground hover:text-accent hover:bg-accent/10'

  return (
    <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 gap-4">

          {/* Brand */}
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center shadow-sm">
              <svg className="w-4.5 h-4.5 text-white" width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground hidden sm:block">
              LogsSystem
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-0.5 overflow-x-clip">
            {navItems.map(item => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${navLinkBase} ${active ? navLinkActive : navLinkInactive}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            })}

            {isAdmin && (
              <>
                <div className="w-px h-5 bg-border mx-1.5 shrink-0" />
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-2 shrink-0 hidden md:block">
                  Admin
                </span>

                {/* Locations dropdown */}
                <div ref={locRef} className="relative" onMouseEnter={() => setLocOpen(true)} onMouseLeave={() => setLocOpen(false)}>
                  <button
                    type="button"
                    onClick={() => setLocOpen(o => !o)}
                    className={`${navLinkBase} ${isLocationActive ? navLinkActive : navLinkInactive}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span className="hidden lg:block">Locations</span>
                    <svg
                      className={`w-3 h-3 transition-transform duration-150 ${locOpen ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {locOpen && (
                    <div className="absolute left-0 top-full pt-1.5 w-44 z-50">
                      <div className="bg-overlay rounded-xl border border-border/60 shadow-lg shadow-black/[0.06] py-1">
                      <p className="px-2.5 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                        Locations
                      </p>
                      <div className="space-y-1">
                        {locationItems.map(item => {
                          const active = pathname.startsWith(item.href)
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setLocOpen(false)}
                              className={`flex items-center gap-2 px-2.5 py-1.5 text-sm font-medium transition-colors mx-1 rounded-lg ${active ? navLinkActive : navLinkInactive}`}
                            >
                              {item.icon}
                              {item.label}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                    </div>
                  )}
                </div>

                {adminItems.map(item => {
                  const active = pathname.startsWith(item.href)
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`${navLinkBase} ${active ? navLinkActive : navLinkInactive}`}
                    >
                      {item.icon}
                      <span className="hidden lg:block">{item.label}</span>
                    </Link>
                  )
                })}
              </>
            )}
          </div>

          {/* User section */}
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin && (
              <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                Admin
              </span>
            )}
            <Link
              href="/settings/passkeys"
              title="Passkeys"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${pathname.startsWith('/settings/passkeys') ? navLinkActive : navLinkInactive}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span className="hidden md:inline">Passkeys</span>
            </Link>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-cyan-600 flex items-center justify-center text-white text-xs font-semibold shadow-sm">
              {initials}
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="hidden sm:block"
            >
              Sign out
            </Button>
          </div>

        </div>
      </div>
    </nav>
  )
}

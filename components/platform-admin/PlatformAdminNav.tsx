'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/platform-admin', label: 'Overview' },
  { href: '/platform-admin/teams', label: 'Teams' },
  { href: '/platform-admin/users', label: 'Users' },
  { href: '/platform-admin/plans', label: 'Plans' },
  { href: '/platform-admin/promotions', label: 'Promotions' },
  { href: '/platform-admin/billing-audit', label: 'Billing Audit' },
  { href: '/platform-admin/audit', label: 'System Audit' },
  { href: '/platform-admin/health', label: 'System Health' },
] as const

function isActive(pathname: string, href: string) {
  return href === '/platform-admin' ? pathname === href : pathname.startsWith(href)
}

export function PlatformAdminNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Platform admin" className="flex flex-wrap items-center gap-1 overflow-x-auto">
      {NAV_ITEMS.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-foreground/30 ${
              active ? 'bg-foreground text-background' : 'text-muted hover:bg-default hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

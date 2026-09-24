import { ShieldAlert } from 'lucide-react'
import { requireSuperAdminPageAccess } from '@/lib/server/requireSuperAdminPageAccess'
import { PlatformAdminNav } from '@/components/platform-admin/PlatformAdminNav'

/**
 * Deliberately no NavBar, no team switcher, no brand gradient — this is
 * DESIGN.md's Operate mode at its most literal: an ops console a superadmin
 * scans and acts in, not a surface that needs to look like the product. It
 * reuses admin-mono (the same scope app/admin/layout.tsx already applies)
 * rather than inventing a second monochrome treatment.
 */
export default async function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdminPageAccess('/platform-admin')

  return (
    <div className="admin-mono min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldAlert className="size-4 shrink-0 text-muted" strokeWidth={2.2} />
            Kamnotheat — Platform Admin
          </div>
          <p className="mt-0.5 text-xs text-muted">Cross-team billing, plans, and system oversight.</p>
          <div className="mt-3">
            <PlatformAdminNav />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}

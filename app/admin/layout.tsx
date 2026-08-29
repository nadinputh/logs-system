import NavBar from '@/components/NavBar'
import { requireTeamPageAccess } from '@/lib/server/requireTeamPageAccess'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireTeamPageAccess('manager', '/admin')

  return (
    <div className="min-h-screen bg-background">
      {/* NavBar is shared, persistent chrome — it must keep the brand signal
          across every surface, admin included, so it sits outside the
          admin-mono scope below rather than as its child. CSS custom
          properties inherit through the DOM regardless of source-file
          boundaries: nesting NavBar inside the scoped div previously leaked
          --accent's override into it too (its account-menu trigger's own
          hover/focus classes read --accent directly). */}
      <NavBar />
      {/* admin-mono: a deliberate, owner-approved departure from the cyan-teal
          signal for this surface only — see the token comment in globals.css. */}
      <div className="admin-mono">
        <main className="max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  )
}

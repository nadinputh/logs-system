import NavBar from '@/components/NavBar'
import { requireTeamPageAccess } from '@/lib/server/requireTeamPageAccess'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireTeamPageAccess('manager', '/admin')

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="max-w-7xl mx-auto">{children}</main>
    </div>
  )
}

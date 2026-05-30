import NavBar from '@/components/NavBar'
import { requireTeamPageAccess } from '@/lib/server/requireTeamPageAccess'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  await requireTeamPageAccess('member', '/dashboard')

  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="max-w-7xl mx-auto">{children}</main>
    </div>
  )
}

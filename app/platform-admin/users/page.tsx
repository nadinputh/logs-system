import { UsersManager } from './UsersManager'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default function PlatformAdminUsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Users</h1>
        <p className="mt-1 text-sm text-muted">
          Search by name or email across every team. Force a sign-out to end all of a user&apos;s live
          sessions immediately, or disable an account to block sign-in entirely.
        </p>
      </div>
      <UsersManager />
    </div>
  )
}

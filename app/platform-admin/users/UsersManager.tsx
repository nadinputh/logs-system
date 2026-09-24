'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/sonner'
import { readApiError } from '@/lib/clientFetch'

type UserRow = {
  _id: string
  name: string | null
  email: string
  role: string
  isSuperAdmin: boolean
  isDisabled: boolean
  emailVerified: boolean
  memberships: { teamName: string; role: string }[]
}

export function UsersManager() {
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function search() {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    try {
      const res = await fetch(`/api/platform-admin/users?q=${encodeURIComponent(q)}`)
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not search users.'))
      setUsers(payload.users ?? [])
      setSearched(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not search users.')
    } finally {
      setLoading(false)
    }
  }

  async function forceSignOut(user: UserRow) {
    setBusyId(user._id)
    try {
      const res = await fetch(`/api/platform-admin/users/${user._id}/force-signout`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not force sign-out.'))
      setTimeout(() => toast.success(`${user.email} signed out of every device`), 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not force sign-out.')
    } finally {
      setBusyId(null)
    }
  }

  async function toggleDisabled(user: UserRow) {
    const disable = !user.isDisabled
    setBusyId(user._id)
    try {
      const res = await fetch(`/api/platform-admin/users/${user._id}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disable }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not update the account.'))
      setUsers((current) =>
        current.map((u) => (u._id === user._id ? { ...u, isDisabled: payload.isDisabled } : u)),
      )
      // Deferred to a separate macrotask: HeroUI's toast queue wraps every add
      // in document.startViewTransition(), which throws a benign
      // "InvalidStateError" in Chrome if it fires in the same tick as the
      // table's own re-render — reordering alone doesn't avoid it, since React
      // can still batch same-tick statements into one flush.
      setTimeout(() => toast.success(disable ? `${user.email} disabled` : `${user.email} re-enabled`), 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the account.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" strokeWidth={2} />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="Search by name or email"
            className="pl-9"
            aria-label="Search users"
          />
        </div>
        <Button variant="brand" size="sm" onPress={search} isLoading={loading} loadingBehavior="disable">
          Search
        </Button>
      </div>

      {searched && (
        <Table aria-label="Users">
          <TableHeader>
            <TableHead isRowHeader>User</TableHead>
            <TableHead className="hidden sm:table-cell">Teams</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableHeader>
          <TableBody>
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={4}>
                  <p className="py-6 text-center text-sm text-muted">No users match that search.</p>
                </TableCell>
              </TableRow>
            )}
            {users.map((user) => (
              <TableRow key={user._id}>
                <TableCell>
                  <p className="font-semibold text-foreground">{user.name ?? user.email}</p>
                  <p className="text-xs text-muted">{user.email}</p>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {user.memberships.length === 0 ? (
                    <span className="text-muted">No teams</span>
                  ) : (
                    <span className="text-sm text-foreground">
                      {user.memberships.map((m) => `${m.teamName} (${m.role})`).join(', ')}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {user.isSuperAdmin && (
                      <span className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                        Superadmin
                      </span>
                    )}
                    {user.isDisabled ? (
                      <span className="inline-flex items-center rounded-full border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                        Disabled
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        Active
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onPress={() => forceSignOut(user)}
                      isDisabled={busyId === user._id}
                    >
                      Force sign-out
                    </Button>
                    <Button
                      variant={user.isDisabled ? 'outline' : 'destructive'}
                      size="sm"
                      onPress={() => toggleDisabled(user)}
                      isDisabled={busyId === user._id}
                    >
                      {user.isDisabled ? 'Re-enable' : 'Disable'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

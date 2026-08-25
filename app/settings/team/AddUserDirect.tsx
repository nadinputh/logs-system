'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'

type DirectRole = 'admin' | 'manager' | 'member' | 'auditor'

// Flow C trigger: provision an account directly. The user gets a set-password
// email (which also verifies them) — no temporary password is shared.
export function AddUserDirect({ canManage, isOwner }: { canManage: boolean; isOwner: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<DirectRole>('member')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = typeof payload.error === 'string' ? payload.error : 'Failed to create user'
        throw new Error(msg)
      }
      setName('')
      setEmail('')
      setRole('member')
      toast.success('User created — a set-password email was sent')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create user')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Add user directly</p>
          <p className="text-xs text-muted">
            Creates the account now and emails a set-password link (active on the current team).
          </p>
        </div>

        {!canManage ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
            You need team admin or owner role to add users.
          </p>
        ) : (
          <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="direct-name">Name</Label>
              <Input id="direct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="direct-email">Email</Label>
              <Input id="direct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="direct-role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole((v ?? 'member') as DirectRole)}>
                <SelectTrigger id="direct-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="admin">admin</SelectItem>}
                  <SelectItem value="manager">manager</SelectItem>
                  <SelectItem value="member">member</SelectItem>
                  <SelectItem value="auditor">auditor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={busy || !name.trim() || !email.trim()}>
                {busy ? 'Creating…' : 'Create user'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

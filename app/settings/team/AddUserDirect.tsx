'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'

type DirectRole = 'admin' | 'manager' | 'member' | 'auditor'

// Flow C trigger: provision an account directly. The user gets a set-password
// email (which also verifies them) — no temporary password is shared.
export function AddUserDirect({ canManage, isOwner }: { canManage: boolean; isOwner: boolean }) {
  const t = useTranslations('adduser')
  const tCommon = useTranslations('common')
  const apiError = useApiError()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<DirectRole>('member')
  const [busy, setBusy] = useState(false)
  // Set when the account was created but the email did not go out. Persistent,
  // not a toast: this link is the only way the user reaches their account, and a
  // notice that auto-dismisses loses it.
  const [undelivered, setUndelivered] = useState<{ email: string; url: string } | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setBusy(true)
    const target = email.trim()
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: target, role }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = apiError(payload, t('failedToCreateUser'))
        throw new Error(msg)
      }
      setName('')
      setEmail('')
      setRole('member')
      // Report what actually happened. Claiming a send that never left the
      // process left admins with no reason to look for the link, and no way to
      // find out it had not arrived.
      if (payload.emailDelivered) {
        setUndelivered(null)
        toast.success(t('created', { email: target }))
      } else {
        setUndelivered({ email: target, url: payload.setPasswordUrl ?? '' })
        toast.warning(t('userCreatedButTheEmail'))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToCreateUser'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {!canManage ? (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
          {t('youNeedTeamAdminOr')}
        </p>
      ) : (
        <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="direct-name">{t('name')}</Label>
              <Input id="direct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('janeDoe')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="direct-email">{t('email')}</Label>
              <Input id="direct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('janeCompanyCom')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="direct-role">{t('role')}</Label>
              <Select value={role} onValueChange={(v) => setRole((v ?? 'member') as DirectRole)}>
                <SelectTrigger id="direct-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isOwner && <SelectItem value="admin">{tCommon('roleAdmin')}</SelectItem>}
                  <SelectItem value="manager">{tCommon('roleManager')}</SelectItem>
                  <SelectItem value="member">{tCommon('roleMember')}</SelectItem>
                  <SelectItem value="auditor">{tCommon('roleAuditor')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                variant="brand"
                size="touch"
                isDisabled={busy || !name.trim() || !email.trim()}
                isLoading={busy}
                loadingBehavior="busy"
              >
                {busy ? t('creating') : t('createUser')}
              </Button>
            </div>
          </form>
        )}

        {undelivered && (
          <div
            role="status"
            className="space-y-2 rounded-xl border border-[var(--status-warning)]/40 bg-[var(--status-warning)]/10 px-3 py-3"
          >
            <p className="text-sm font-semibold text-foreground">
              {t('notDelivered', { email: undelivered.email })}
            </p>
            <p className="text-xs text-muted">
              {t('sendThemThisLinkYourself')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(undelivered.url)
                  toast.success(t('setPasswordLinkCopied'))
                }}
                className="max-w-[320px] truncate rounded bg-muted px-2 py-1 text-xs text-muted hover:text-foreground"
              >
                {undelivered.url}
              </button>
              <Button size="sm" variant="outline" onPress={() => setUndelivered(null)}>
                {t('dismiss')}
              </Button>
            </div>
          </div>
        )}
    </>
  )
}

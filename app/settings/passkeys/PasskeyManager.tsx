'use client'

import { useState, useCallback } from 'react'
import { useLocale } from 'next-intl'
import { useMounted } from '@/lib/useMounted'
import { useApiError } from '@/lib/useApiError'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogIcon, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { Trash2, Plus, KeyRound } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Passkey {
  _id: string
  credentialId: string
  deviceType: string
  backedUp: boolean
  createdAt: string
  lastUsedAt: string
}

interface PasskeyManagerProps {
  initialPasskeys: Passkey[]
}

export default function PasskeyManager({ initialPasskeys }: PasskeyManagerProps) {
  const t = useTranslations('passkeys')
  const apiError = useApiError()
  const locale = useLocale()
  const mounted = useMounted()
  const fmt = (v: string) => (mounted ? new Date(v).toLocaleDateString(locale) : '')
  const [passkeys, setPasskeys] = useState<Passkey[]>(initialPasskeys)
  const [loading, setLoading] = useState(false)
  const [passkeyToDelete, setPasskeyToDelete] = useState<Passkey | null>(null)
  const [deletingPasskeyId, setDeletingPasskeyId] = useState<string | null>(null)

  const handleRegister = useCallback(async () => {
    setLoading(true)
    try {
      const optRes = await fetch('/api/auth/passkey/register/options')
      if (!optRes.ok) throw new Error(await optRes.text())
      const options = await optRes.json()

      const response = await startRegistration({ optionsJSON: options })

      const verRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
      if (!verRes.ok) {
        const data = await verRes.json()
        throw new Error(apiError(data, t('verificationFailed')))
      }

      toast.success(t('passkeyRegistered'))
      window.location.reload()
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        toast.error(err.message ?? t('registrationFailed'))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDelete = useCallback(async () => {
    if (!passkeyToDelete) return

    setDeletingPasskeyId(passkeyToDelete._id)
    try {
      const res = await fetch(`/api/auth/passkey/${passkeyToDelete._id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(t('deleteFailed'))
      setPasskeys((prev) => prev.filter((p) => p._id !== passkeyToDelete._id))
      setPasskeyToDelete(null)
      toast.success(t('passkeyRemoved'))
    } catch {
      toast.error(t('failedToRemovePasskey'))
    } finally {
      setDeletingPasskeyId(null)
    }
  }, [passkeyToDelete])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {passkeys.length === 0 ? t('noPasskeysRegisteredYet') : t('count', { count: passkeys.length })}
        </p>
        <Button onPress={handleRegister} isDisabled={loading} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          {loading ? t('waiting') : t('addPasskey')}
        </Button>
      </div>

      {passkeys.length > 0 && (
        <ul className="divide-y divide-border/60" role="list">
          {passkeys.map((pk) => (
            <li key={pk._id} className="flex items-center justify-between gap-3 py-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                  <KeyRound className="w-4 h-4 text-sky-500" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {pk.deviceType === 'multiDevice' ? t('syncedPasskey') : t('deviceBoundPasskey')}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {t('addedLastUsed', { added: fmt(pk.createdAt), used: fmt(pk.lastUsedAt) })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {pk.backedUp && (
                  <span className="inline-flex items-center text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{t('backedUp')}</span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-[var(--status-danger)] hover:text-[var(--status-danger)] hover:bg-[var(--status-danger)]/10"
                  aria-label={t('removeAria', { kind: pk.deviceType === 'multiDevice' ? t('kindSynced') : t('kindDevice'), date: fmt(pk.createdAt) })}
                  onPress={() => setPasskeyToDelete(pk)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(passkeyToDelete)} onOpenChange={(open) => !open && setPasskeyToDelete(null)}>
        <DialogContent size="xs">
          <DialogHeader>
            <DialogIcon className="size-12 rounded-full bg-[var(--status-danger)]/10 text-[var(--status-danger)]">
              <Trash2 className="size-5" aria-hidden />
            </DialogIcon>
            <DialogTitle className="mt-4 text-xl font-semibold tracking-normal">{t('removePasskey')}</DialogTitle>
          </DialogHeader>
          <DialogBody className="mt-3 text-sm leading-6 text-muted">
            {t('removeBody', { kind: passkeyToDelete?.deviceType === 'multiDevice' ? t('kindSynced') : t('kindDevice') })}
          </DialogBody>
          <DialogFooter className="mt-5 gap-2">
            <Button
              variant="outline"
              size="sm"
              onPress={() => setPasskeyToDelete(null)}
              isDisabled={Boolean(deletingPasskeyId)}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onPress={handleDelete}
              isLoading={deletingPasskeyId === passkeyToDelete?._id}
            >
              {t('removePasskey2')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function PasskeyLoginButton({ email }: { email: string }) {
  const t = useTranslations('passkeys')
  const apiError = useApiError()
  const [loading, setLoading] = useState(false)

  const handleLogin = useCallback(async () => {
    setLoading(true)
    try {
      const optRes = await fetch('/api/auth/passkey/authenticate/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!optRes.ok) {
        const data = await optRes.json()
        throw new Error(apiError(data, t('noPasskeysForThisAccount')))
      }
      const { userId, ...options } = await optRes.json()

      const response = await startAuthentication({ optionsJSON: options })

      const verRes = await fetch('/api/auth/passkey/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, userId }),
      })
      if (!verRes.ok) {
        const data = await verRes.json()
        throw new Error(apiError(data, t('verificationFailed')))
      }
      const { preAuthToken } = await verRes.json()

      await signIn('passkey-token', { preAuthToken, redirect: true, callbackUrl: '/dashboard' })
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        toast.error(err.message ?? t('passkeyLoginFailed'))
      }
    } finally {
      setLoading(false)
    }
  }, [email])

  return (
    <Button variant="outline" onPress={handleLogin} isDisabled={loading} className="w-full">
      <KeyRound className="w-4 h-4 mr-2" />
      {loading ? t('authenticating') : t('signInWithPasskey')}
    </Button>
  )
}

'use client'

import { useState, useCallback } from 'react'
import { startRegistration, startAuthentication } from '@simplewebauthn/browser'
import { signIn } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogIcon, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { Trash2, Plus, KeyRound } from 'lucide-react'

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
        throw new Error(data.error ?? 'Verification failed')
      }

      toast.success('Passkey registered!')
      window.location.reload()
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        toast.error(err.message ?? 'Registration failed')
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
      if (!res.ok) throw new Error('Delete failed')
      setPasskeys((prev) => prev.filter((p) => p._id !== passkeyToDelete._id))
      setPasskeyToDelete(null)
      toast.success('Passkey removed')
    } catch {
      toast.error('Failed to remove passkey')
    } finally {
      setDeletingPasskeyId(null)
    }
  }, [passkeyToDelete])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {passkeys.length === 0 ? 'No passkeys registered yet.' : `${passkeys.length} passkey${passkeys.length !== 1 ? 's' : ''} registered`}
        </p>
        <Button onClick={handleRegister} disabled={loading} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          {loading ? 'Waiting…' : 'Add Passkey'}
        </Button>
      </div>

      {passkeys.map((pk) => (
        <div key={pk._id} className="flex items-center justify-between p-3.5 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
              <KeyRound className="w-4 h-4 text-sky-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {pk.deviceType === 'multiDevice' ? 'Synced passkey' : 'Device-bound passkey'}
              </p>
              <p className="text-xs text-muted">
                Added {new Date(pk.createdAt).toLocaleDateString()} · Last used{' '}
                {new Date(pk.lastUsedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pk.backedUp && (
              <span className="inline-flex items-center text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">Backed up</span>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="text-red-500 hover:text-red-400 hover:bg-red-500/10"
              aria-label="Remove passkey"
              onClick={() => setPasskeyToDelete(pk)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ))}

      <Dialog open={Boolean(passkeyToDelete)} onOpenChange={(open) => !open && setPasskeyToDelete(null)}>
        <DialogContent size="xs">
          <DialogHeader>
            <DialogIcon className="size-12 rounded-full bg-red-500/10 text-red-500">
              <Trash2 className="size-5" aria-hidden />
            </DialogIcon>
            <DialogTitle className="mt-4 text-xl font-semibold tracking-normal">Remove passkey?</DialogTitle>
          </DialogHeader>
          <DialogBody className="mt-3 text-sm leading-6 text-muted">
            This will remove the selected {passkeyToDelete?.deviceType === 'multiDevice' ? 'synced' : 'device-bound'} passkey from your account. You can register it again later if this device is still available.
          </DialogBody>
          <DialogFooter className="mt-5 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPasskeyToDelete(null)}
              disabled={Boolean(deletingPasskeyId)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              isLoading={deletingPasskeyId === passkeyToDelete?._id}
            >
              Remove Passkey
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function PasskeyLoginButton({ email }: { email: string }) {
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
        throw new Error(data.error ?? 'No passkeys for this account')
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
        throw new Error(data.error ?? 'Verification failed')
      }
      const { preAuthToken } = await verRes.json()

      await signIn('passkey-token', { preAuthToken, redirect: true, callbackUrl: '/dashboard' })
    } catch (err: any) {
      if (err.name !== 'NotAllowedError') {
        toast.error(err.message ?? 'Passkey login failed')
      }
    } finally {
      setLoading(false)
    }
  }, [email])

  return (
    <Button variant="outline" onClick={handleLogin} disabled={loading} className="w-full">
      <KeyRound className="w-4 h-4 mr-2" />
      {loading ? 'Authenticating…' : 'Sign in with Passkey'}
    </Button>
  )
}

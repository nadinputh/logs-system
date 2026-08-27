'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FormNotice } from '@/components/auth/FormNotice'
import { toast } from '@/components/ui/sonner'

/**
 * "Sign out other devices" — the only revocation channel a JWT-strategy session
 * has. Bumping User.sessionsVersion invalidates every token for this user,
 * including the caller's, so we call signOut() locally right after to keep
 * this browser signed in from a fresh mint of the current cookie.
 *
 * Without this the app has no answer to "my phone was stolen" short of
 * rotating NEXTAUTH_SECRET and signing every user out of everything.
 */
export function ActiveSessions() {
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function handleRevoke() {
    if (!confirmed) {
      setConfirmed(true)
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/signout-others', { method: 'POST' })
      if (!res.ok) throw new Error('Could not sign other devices out')
      toast.success('Other devices signed out — signing you in fresh…')
      // Our own cookie is now invalid too; end this session and re-land on login.
      await signOut({ callbackUrl: '/login' })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not sign other devices out')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Ends every active session on this account, including this one. You'll be sent to the
        login page in a moment and can sign back in here; every other browser and phone will
        land on the login page too on its next request.
      </p>

      {confirmed && (
        <FormNotice
          tone="warning"
          title="This signs you out of every device, including this one"
        >
          You'll be sent to the login page in a moment. Click again to confirm.
        </FormNotice>
      )}

      <Button
        size="sm"
        variant="outline"
        onPress={() => void handleRevoke()}
        isDisabled={busy}
        isLoading={busy}
        loadingBehavior="busy"
      >
        <LogOut className="mr-1.5 size-3.5" strokeWidth={2.2} />
        {confirmed ? (busy ? 'Signing out…' : 'Confirm — sign every device out') : 'Sign out other devices'}
      </Button>
    </div>
  )
}

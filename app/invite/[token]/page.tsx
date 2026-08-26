'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn, useSession } from 'next-auth/react'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormNotice } from '@/components/auth/FormNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Invite = {
  valid: boolean
  email?: string
  role?: string
  teamName?: string
  hasAccount?: boolean
  error?: string
}

export default function InvitePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const { status: sessionStatus } = useSession()

  const [invite, setInvite] = useState<Invite | null>(null)
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/teams/invites/${params.token}`)
      .then((r) => r.json())
      .then(setInvite)
      .catch(() => setInvite({ valid: false, error: 'Could not load invite.' }))
  }, [params.token])

  // Logged-in users with the matching account accept directly.
  async function acceptAsCurrentUser() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/teams/invites/${params.token}/accept`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not accept invite')
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err?.message ?? 'Could not accept invite')
    } finally {
      setBusy(false)
    }
  }

  // New users create an account from the invite, then auto sign-in.
  async function createAccount(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/teams/invites/${params.token}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not create account')

      const result = await signIn('credentials', {
        email: data.email,
        password,
        redirect: false,
      })
      if (result?.error) {
        router.push('/login')
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: any) {
      setError(err?.message ?? 'Could not create account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      headline={
        <>
          Join the team,
          <br />
          <span className="gradient-text">keep the ledger whole.</span>
        </>
      }
      subhead="An invite links your account to a team and its locations. Accepting is all that is left."
    >
      <div className="auth-stack" aria-live="polite">
        {!invite && <h1 className="text-2xl font-bold tracking-tight">Loading invite…</h1>}

        {invite && !invite.valid && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Invite unavailable</h1>
            <p className="text-sm text-muted">{invite.error}</p>
            <Link
              href="/login"
              className="inline-block py-3 -my-3 text-sm font-semibold text-[var(--accent)] hover:underline"
            >
              Go to sign in
            </Link>
          </>
        )}

        {invite?.valid && (
          <>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Join {invite.teamName}</h1>
              <p className="mt-1.5 text-sm text-muted">
                Invited as <span className="font-semibold text-foreground">{invite.role}</span> · {invite.email}
              </p>
            </div>

            <div className="empty:hidden">
              {error && <FormNotice tone="danger" title={error} />}
            </div>

            {invite.hasAccount ? (
              sessionStatus === 'authenticated' ? (
                <Button
                  size="touch"
                  variant="brand"
                  className="w-full"
                  isLoading={busy}
                  loadingBehavior="busy"
                  onClick={acceptAsCurrentUser}
                >
                  {busy ? 'Joining…' : `Accept and join ${invite.teamName}`}
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted">You already have an account. Sign in to accept this invite.</p>
                  <Button
                    size="touch"
                    variant="brand"
                    className="w-full"
                    onClick={() => router.push(`/login?next=/invite/${params.token}`)}
                  >
                    Sign in to accept
                  </Button>
                </div>
              )
            ) : (
              <form onSubmit={createAccount} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Jane Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">Create a password</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
                </div>
                <Button
                  size="touch"
                  variant="brand"
                  type="submit"
                  className="w-full"
                  isLoading={busy}
                  loadingBehavior="busy"
                >
                  {busy ? 'Creating…' : 'Create account & join'}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  )
}

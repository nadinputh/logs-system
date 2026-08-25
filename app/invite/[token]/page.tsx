'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn, useSession } from 'next-auth/react'
import { LogoMark } from '@/components/Logo'
import { ParticleField } from '@/components/ParticleField'
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
    <div className="relative min-h-screen flex items-center justify-center p-6">
      <ParticleField className="fixed inset-0 z-0" />
      <div className="relative z-10 w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <LogoMark className="w-[18px] h-[18px] text-white" />
          </div>
          <span className="font-bold text-foreground">Kamnotheat</span>
        </div>

        {!invite && <p className="text-sm text-muted">Loading invite…</p>}

        {invite && !invite.valid && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Invite unavailable</h2>
            <p className="text-sm text-muted">{invite.error}</p>
            <Link href="/login" className="text-sm font-medium text-accent hover:underline">Go to sign in</Link>
          </div>
        )}

        {invite?.valid && (
          <>
            <div>
              <h2 className="text-2xl font-bold text-foreground">Join {invite.teamName}</h2>
              <p className="mt-1.5 text-sm text-muted">
                Invited as <span className="font-medium text-foreground">{invite.role}</span> · {invite.email}
              </p>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            {invite.hasAccount ? (
              sessionStatus === 'authenticated' ? (
                <Button className="w-full" disabled={busy} onClick={acceptAsCurrentUser}>
                  {busy ? 'Joining…' : `Accept and join ${invite.teamName}`}
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted">You already have an account. Sign in to accept this invite.</p>
                  <Button className="w-full" onClick={() => router.push(`/login?next=/invite/${params.token}`)}>
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
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? 'Creating…' : 'Create account & join'}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn, useSession } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'
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
  const t = useTranslations('invite')
  const apiError = useApiError()
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
      .catch(() => setInvite({ valid: false, error: t('loadFailed') }))
  }, [params.token])

  // Logged-in users with the matching account accept directly.
  async function acceptAsCurrentUser() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch(`/api/teams/invites/${params.token}/accept`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(data, t('acceptFailed')))
      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      setError(err?.message ?? t('acceptFailed'))
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
      if (!res.ok) throw new Error(apiError(data, t('createFailed')))

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
      setError(err?.message ?? t('createFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      headline={
        <>
          {t('headline1')}
          <br />
          <span className="gradient-text">{t('headline2')}</span>
        </>
      }
      subhead={t('subhead')}
    >
      <div className="auth-stack" aria-live="polite">
        {!invite && <h1 className="text-2xl font-bold tracking-tight">{t('loading')}</h1>}

        {invite && !invite.valid && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">{t('unavailable')}</h1>
            <p className="text-sm text-muted">{invite.error}</p>
            <Link
              href="/login"
              className="inline-block py-3 -my-3 text-sm font-semibold text-[var(--accent)] hover:underline"
            >
              {t('goSignIn')}
            </Link>
          </>
        )}

        {invite?.valid && (
          <>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('joinTeam', { team: invite.teamName ?? '' })}</h1>
              <p className="mt-1.5 text-sm text-muted">
                {t.rich('invitedAs', { role: invite.role ?? '', email: invite.email ?? '', b: (c) => <span className="font-semibold text-foreground">{c}</span> })}
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
                  {busy ? t('joining') : t('acceptJoin', { team: invite.teamName ?? '' })}
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted">{t('haveAccount')}</p>
                  <Button
                    size="touch"
                    variant="brand"
                    className="w-full"
                    onClick={() => router.push(`/login?next=/invite/${params.token}`)}
                  >
                    {t('signInAccept')}
                  </Button>
                </div>
              )
            ) : (
              <form onSubmit={createAccount} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">{t('yourName')}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder={t('namePlaceholder')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t('createPassword')}</Label>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder={t('passwordPlaceholder')} />
                </div>
                <Button
                  size="touch"
                  variant="brand"
                  type="submit"
                  className="w-full"
                  isLoading={busy}
                  loadingBehavior="busy"
                >
                  {busy ? t('creating') : t('createJoin')}
                </Button>
              </form>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  )
}

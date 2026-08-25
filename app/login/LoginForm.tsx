'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { startAuthentication } from '@simplewebauthn/browser'
import { Fingerprint, Loader2 } from 'lucide-react'
import { FormNotice } from '@/components/auth/FormNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') || '/dashboard'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [needsVerify, setNeedsVerify] = useState(false)
  const [resent, setResent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  async function handleResend() {
    setResent(true)
    await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {})
  }

  async function handlePasskeyLogin() {
    setError('')
    if (!email) {
      setError('Enter your email address first, then sign in with your passkey.')
      return
    }
    setPasskeyLoading(true)
    try {
      const optRes = await fetch('/api/auth/passkey/authenticate/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (!optRes.ok) {
        const data = await optRes.json().catch(() => ({}))
        throw new Error(data.error ?? 'No passkey is registered for this account.')
      }
      const { userId, ...options } = await optRes.json()

      const response = await startAuthentication({ optionsJSON: options })

      const verRes = await fetch('/api/auth/passkey/authenticate/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, userId }),
      })
      if (!verRes.ok) {
        const data = await verRes.json().catch(() => ({}))
        throw new Error(data.error ?? 'That passkey could not be verified.')
      }
      const { preAuthToken } = await verRes.json()

      const result = await signIn('passkey-token', { preAuthToken, redirect: false })
      if (result?.error) {
        setError('Passkey sign-in failed. Try your password instead.')
      } else {
        router.push(nextUrl)
        router.refresh()
      }
    } catch (err: unknown) {
      // The user dismissing the platform prompt is a choice, not an error.
      if ((err as { name?: string })?.name !== 'NotAllowedError') {
        setError(
          (err as { message?: string })?.message ??
            'Passkey sign-in failed. Try your password instead.',
        )
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNeedsVerify(false)
    setResent(false)
    setLoading(true)

    const result = await signIn('credentials', { email, password, redirect: false })

    setLoading(false)

    if (result?.error) {
      if (result.error.includes('EMAIL_NOT_VERIFIED')) {
        setNeedsVerify(true)
      } else {
        setError('That email and password do not match an account.')
      }
    } else {
      router.push(nextUrl)
      router.refresh()
    }
  }

  const busy = loading || passkeyLoading

  return (
    <div className="auth-stack">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted">Staff and admin access to the console.</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-fields">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@company.com"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Your password"
          />
        </div>

        {/* The live region is always mounted, so a notice appearing inside it is
            announced. A region created at the same time as its content is not. */}
        <div aria-live="polite" className="empty:hidden space-y-3">
          {error && <FormNotice tone="danger" title={error} />}
          {needsVerify && (
            <FormNotice tone="warning" title="Verify your email before signing in">
              {resent ? (
                <span>A new verification link is on its way to {email}.</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="font-semibold text-[var(--accent)] hover:underline"
                >
                  Resend the verification email
                </button>
              )}
            </FormNotice>
          )}
        </div>

        <Button
          type="submit"
          isLoading={loading}
          isDisabled={busy}
          variant="brand"
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
              Signing in…
            </>
          ) : (
            'Sign in'
          )}
        </Button>

        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-[var(--panel-border)]" />
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">or</span>
          <span className="h-px flex-1 bg-[var(--panel-border)]" />
        </div>

        <Button
          type="button"
          onPress={handlePasskeyLogin}
          isLoading={passkeyLoading}
          isDisabled={busy}
          variant="outline"
          className="press w-full"
        >
          {passkeyLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
              Waiting for your passkey…
            </>
          ) : (
            <>
              <Fingerprint className="size-4" strokeWidth={2.3} />
              Sign in with a passkey
            </>
          )}
        </Button>
      </form>

      <p className="text-sm text-muted">
        New here?{' '}
        <Link href="/register" className="font-semibold text-[var(--accent)] hover:underline">
          Create a workspace
        </Link>
      </p>
    </div>
  )
}

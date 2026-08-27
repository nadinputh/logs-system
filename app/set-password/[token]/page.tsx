'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormNotice } from '@/components/auth/FormNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SetPasswordPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  /**
   * Validate before rendering the form. Without this the page accepted a
   * password, a confirmation and a submit before revealing the link was dead —
   * and its only exit led to a sign-in that reports "email and password do not
   * match" for an account that exists. The invite page has validated on mount
   * all along; this is the higher-stakes flow, so it should not be the laxer one.
   */
  const [status, setStatus] = useState<'checking' | 'valid' | 'expired'>('checking')
  const [tokenEmail, setTokenEmail] = useState('')
  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current) return
    checked.current = true
    fetch(`/api/auth/set-password?token=${encodeURIComponent(params.token)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (res.ok && data.valid) {
          setTokenEmail(data.email ?? '')
          setStatus('valid')
        } else {
          setStatus('expired')
        }
      })
      .catch(() => setStatus('expired'))
  }, [params.token])

  async function requestNewLink() {
    if (!tokenEmail) return
    setResending(true)
    try {
      await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: tokenEmail }),
      })
      setResent(true)
    } catch {
      setError('Could not request a new link just now. Try again in a moment.')
    } finally {
      setResending(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Could not set password')

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
      setError(err?.message ?? 'Could not set password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      headline={
        <>
          Your account is waiting.
          <br />
          <span className="gradient-text">Give it a password.</span>
        </>
      }
      subhead="Someone created this account for you. Setting a password activates it and verifies the address in one step."
    >
      <div className="auth-stack">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {status === 'expired' ? 'This link has expired' : 'Set your password'}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {status === 'checking'
              ? 'Checking your link…'
              : status === 'expired'
                ? 'Set-password links last 7 days. Your account is still here — request a new link and it will arrive at the same address.'
                : 'Choose a password to activate your account.'}
          </p>
        </div>

        <div aria-live="polite" className="empty:hidden">
          {error && <FormNotice tone="danger" title={error} />}
          {status === 'expired' && resent && (
            <FormNotice tone="success" title="A new link is on its way">
              Check {tokenEmail || 'your inbox'} for a fresh set-password link.
            </FormNotice>
          )}
        </div>

        {status === 'expired' && !resent && (
          <Button
            size="touch"
            variant="brand"
            className="w-full"
            isLoading={resending}
            loadingBehavior="busy"
            onPress={() => void requestNewLink()}
          >
            {resending ? 'Sending…' : 'Email me a new link'}
          </Button>
        )}

        {status === 'valid' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Re-enter password" />
          </div>
          <Button
            size="touch"
            variant="brand"
            type="submit"
            className="w-full"
            isLoading={busy}
            loadingBehavior="busy"
          >
            {busy ? 'Activating…' : 'Set password & sign in'}
          </Button>
        </form>
        )}

        <p className="text-sm text-muted">
          <Link
            href="/login"
            className="inline-block py-3 -my-3 font-semibold text-[var(--accent)] hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}

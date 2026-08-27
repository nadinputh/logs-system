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

/**
 * Password-reset landing page.
 *
 * Mirrors /set-password/[token] in shape and validates the token before
 * rendering the form — the same guarantee. Differs in copy (the recipient
 * asked for this) and in server semantics (the account already exists with a
 * password and a verified email; this replaces the password).
 */
export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<'checking' | 'valid' | 'expired'>('checking')
  const [tokenEmail, setTokenEmail] = useState('')
  const [resent, setResent] = useState(false)
  const [resending, setResending] = useState(false)
  const checked = useRef(false)

  useEffect(() => {
    if (checked.current) return
    checked.current = true
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(params.token)}`)
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
      await fetch('/api/auth/forgot-password', {
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
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // The 400 branch carries Zod's flattened issues — an object — that
        // stringifies as "[object Object]". Guard against that the same way
        // register does.
        const detail =
          typeof data?.error === 'string'
            ? data.error
            : res.status === 400
              ? 'Check the details you entered and try again.'
              : 'Could not reset password. Try again in a moment.'
        throw new Error(detail)
      }

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
      setError(err?.message ?? 'Could not reset password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      headline={
        <>
          Forgot your password?
          <br />
          <span className="gradient-text">Choose a new one.</span>
        </>
      }
      subhead="Reset links are single-use and expire in one hour. Setting a new password signs you in and ends every other active session on this account."
    >
      <div className="auth-stack">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {status === 'expired' ? 'This link has expired' : 'Reset your password'}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {status === 'checking'
              ? 'Checking your link…'
              : status === 'expired'
                ? 'Reset links last 1 hour. Request a new one and it will arrive at the same address.'
                : 'Choose a new password. Signing in ends every other active session on this account.'}
          </p>
        </div>

        <div aria-live="polite" className="empty:hidden">
          {error && <FormNotice tone="danger" title={error} />}
          {status === 'expired' && resent && (
            <FormNotice tone="success" title="A new link is on its way">
              If an account exists for {tokenEmail || 'this address'}, a reset link is on its way.
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
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
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
            {busy ? 'Resetting…' : 'Reset password & sign in'}
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

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MailCheck, MailWarning } from 'lucide-react'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormNotice } from '@/components/auth/FormNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * Forgot-password entry.
 *
 * The response is neutral: it never confirms or denies that the address maps
 * to an account, and its copy has to match that neutrality — otherwise the
 * network shape leaks what the JSON hides.
 *
 * The `mailConfigured` field is server state (independent of the address) and
 * flips the confirmation copy so the app doesn't promise a link the server
 * cannot send.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [mailConfigured, setMailConfigured] = useState(true)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 429) {
        throw new Error(
          typeof data.error === 'string'
            ? data.error
            : 'Too many attempts. Try again in a few minutes.',
        )
      }
      if (!res.ok) throw new Error('Could not request a reset link. Try again in a moment.')
      setMailConfigured(data?.mailConfigured !== false)
      setDone(true)
    } catch (err: any) {
      setError(err?.message ?? 'Could not request a reset link. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout
        headline={
          <>
            Check your email.
            <br />
            <span className="gradient-text">If it's here, it's here.</span>
          </>
        }
        subhead="For accounts that exist and are already signed in once, a reset link arrives at the address on file."
      >
        <div className="auth-stack">
          <span
            className={
              mailConfigured
                ? 'inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]'
                : 'inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--status-warning)]/10 text-[var(--status-warning)]'
            }
          >
            {mailConfigured ? (
              <MailCheck className="size-5" strokeWidth={2.2} />
            ) : (
              <MailWarning className="size-5" strokeWidth={2.2} />
            )}
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {mailConfigured ? 'Check your email' : 'The mail server is not sending'}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {mailConfigured ? (
                <>
                  If an account exists for{' '}
                  <span className="font-semibold text-foreground">{email}</span>, a reset link is
                  on its way. It's single-use and expires in one hour.
                </>
              ) : (
                <>
                  This server is not configured to send mail, so no reset link was sent. Contact
                  your administrator — they can reissue the account's set-password link from the
                  members list.
                </>
              )}
            </p>
          </div>
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

  return (
    <AuthLayout
      headline={
        <>
          Forgot your password?
          <br />
          <span className="gradient-text">Get a reset link.</span>
        </>
      }
      subhead="Enter the address you sign in with. If it maps to an account, a one-hour, single-use reset link goes to that inbox."
    >
      <div className="auth-stack">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="mt-1.5 text-sm text-muted">
            We answer the same way for every address, so this page never confirms or denies
            whether an account exists.
          </p>
        </div>

        <div aria-live="polite" className="empty:hidden">
          {error && <FormNotice tone="danger" title={error} />}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Button
            size="touch"
            variant="brand"
            type="submit"
            className="w-full"
            isLoading={busy}
            loadingBehavior="busy"
            isDisabled={!email.trim()}
          >
            {busy ? 'Sending…' : 'Email me a reset link'}
          </Button>
        </form>

        <p className="text-sm text-muted">
          Remembered it?{' '}
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

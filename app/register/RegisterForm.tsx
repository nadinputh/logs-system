'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { FormNotice } from '@/components/auth/FormNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Mirrors the server's RegisterSchema so the hint never overstates the rule. */
const MIN_PASSWORD = 8

export function RegisterForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, teamName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // A 400 carries Zod's flattened issues — an object. Passing it straight
        // to `new Error()` rendered "[object Object]" at the user.
        const detail =
          typeof data?.error === 'string'
            ? data.error
            : res.status === 400
              ? 'Check the details you entered and try again.'
              : 'Something went wrong creating your account. Try again in a moment.'
        throw new Error(detail)
      }
      setDone(true)
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message
      setError(
        typeof message === 'string' && message
          ? message
          : 'Something went wrong creating your account. Try again in a moment.',
      )
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      // A view change inside the same card, so it is crossfaded rather than
      // snapped — the confirmation reads as the form's outcome, not a new page.
      <div className="animate-panel-swap space-y-5">
        <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
          <MailCheck className="size-5" strokeWidth={2.2} />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Check your email</h1>
          <p className="mt-2 text-sm text-muted">
            If that address can be registered, a verification link is on its way to{' '}
            <span className="font-semibold text-foreground">{email}</span>. It expires in one
            hour. Verify it, then sign in.
          </p>
        </div>
        <p className="text-sm text-muted">
          Nothing arrived? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={() => setDone(false)}
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            try a different address
          </button>
          .
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          <ArrowLeft className="size-4" strokeWidth={2.4} />
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-panel-swap auth-stack">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create your workspace</h1>
        <p className="mt-1.5 text-sm text-muted">Start a new team — you will be its owner.</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-fields">
        <div className="space-y-1.5">
          <Label htmlFor="name">Your name</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            placeholder="Jane Doe"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="teamName">Team name</Label>
          <Input
            id="teamName"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            required
            autoComplete="organization"
            placeholder="Acme HQ"
          />
        </div>

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
          {/* The requirement sits on the label row, so it is read before typing
              rather than after — and it costs no extra line of height. */}
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">Password</Label>
            <span id="password-hint" className="text-xs text-muted">
              {MIN_PASSWORD}+ characters
            </span>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            aria-describedby="password-hint"
            placeholder="Choose a password"
          />
        </div>

        <div aria-live="polite" className="empty:hidden">
          {error && <FormNotice tone="danger" title={error} />}
        </div>

        <Button type="submit" variant="brand" isLoading={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
              Creating your workspace…
            </>
          ) : (
            'Create account'
          )}
        </Button>
      </form>

      <p className="text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-[var(--accent)] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}

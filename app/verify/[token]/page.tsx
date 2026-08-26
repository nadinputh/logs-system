'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'

export default function VerifyEmailPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending')
  const [message, setMessage] = useState('')
  // React StrictMode double-invokes effects in development, and this effect
  // spends a single-use token — so the second call found it already redeemed and
  // reported "Link expired" over a verification that had just succeeded. The
  // server now distinguishes the two, and this stops the second call entirely.
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    sent.current = true
    let active = true
    ;(async () => {
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: params.token }),
        })
        const data = await res.json().catch(() => ({}))
        if (!active) return
        if (res.ok) {
          setStatus('ok')
        } else {
          setStatus('error')
          setMessage(data.error ?? 'This link is invalid or has expired.')
        }
      } catch {
        if (active) {
          setStatus('error')
          setMessage('Something went wrong. Please try again.')
        }
      }
    })()
    return () => {
      active = false
    }
  }, [params.token])

  return (
    <AuthLayout
      headline={
        <>
          One address,
          <br />
          <span className="gradient-text">confirmed once.</span>
        </>
      }
      subhead="Verifying your email is what activates the account. The link is single-use and expires an hour after it was sent."
    >
      {/* The outcome replaces a line of status text, so it is announced rather
          than silently swapped. */}
      <div className="auth-stack" aria-live="polite">
        {status === 'pending' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Verifying your email…</h1>
            <p className="text-sm text-muted">This only takes a moment.</p>
          </>
        )}

        {status === 'ok' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Email verified</h1>
            <p className="text-sm text-muted">Your account is active. You can sign in now.</p>
            <Button
              size="touch"
              variant="brand"
              className="w-full"
              onClick={() => router.push('/login')}
            >
              Go to sign in
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">That link did not work</h1>
            <p className="text-sm text-muted">{message}</p>
            <Link
              href="/login"
              className="inline-block py-3 -my-3 text-sm font-semibold text-[var(--accent)] hover:underline"
            >
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  )
}

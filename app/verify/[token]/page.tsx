'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { Button } from '@/components/ui/button'

export default function VerifyEmailPage() {
  const t = useTranslations('verify')
  const apiError = useApiError()
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
          setMessage(apiError(data, t('invalidLink')))
        }
      } catch {
        if (active) {
          setStatus('error')
          setMessage(t('wentWrong'))
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
          {t('headline1')}
          <br />
          <span className="gradient-text">{t('headline2')}</span>
        </>
      }
      subhead={t('subhead')}
    >
      {/* The outcome replaces a line of status text, so it is announced rather
          than silently swapped. */}
      <div className="auth-stack" aria-live="polite">
        {status === 'pending' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">{t('pendingTitle')}</h1>
            <p className="text-sm text-muted">{t('pendingBody')}</p>
          </>
        )}

        {status === 'ok' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">{t('okTitle')}</h1>
            <p className="text-sm text-muted">{t('okBody')}</p>
            <Button
              size="touch"
              variant="brand"
              className="w-full"
              onClick={() => router.push('/login')}
            >
              {t('goSignIn')}
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold tracking-tight">{t('errorTitle')}</h1>
            <p className="text-sm text-muted">{message}</p>
            <Link
              href="/login"
              className="inline-block py-3 -my-3 text-sm font-semibold text-[var(--accent)] hover:underline"
            >
              {t('backSignIn')}
            </Link>
          </>
        )}
      </div>
    </AuthLayout>
  )
}

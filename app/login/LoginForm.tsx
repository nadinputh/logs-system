'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { startAuthentication } from '@simplewebauthn/browser'
import { Fingerprint, Loader2 } from 'lucide-react'
import { FormNotice } from '@/components/auth/FormNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type RedirectReason = 'session_expired' | 'session_revoked' | 'signed_out_others'

function isRedirectReason(v: string | null): v is RedirectReason {
  return (
    v === 'session_expired' || v === 'session_revoked' || v === 'signed_out_others'
  )
}

const REASON_KEYS: Record<
  RedirectReason,
  { tone: 'success' | 'warning'; titleKey: string; bodyKey: string }
> = {
  signed_out_others: {
    tone: 'success',
    titleKey: 'reasonSignedOutOthersTitle',
    bodyKey: 'reasonSignedOutOthersBody',
  },
  session_expired: {
    tone: 'warning',
    titleKey: 'reasonSessionExpiredTitle',
    bodyKey: 'reasonSessionExpiredBody',
  },
  session_revoked: {
    tone: 'warning',
    titleKey: 'reasonSessionRevokedTitle',
    bodyKey: 'reasonSessionRevokedBody',
  },
}

export function LoginForm() {
  const t = useTranslations('login')
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') || '/dashboard'
  const reasonParam = searchParams.get('reason')
  const reason: RedirectReason | null = isRedirectReason(reasonParam) ? reasonParam : null
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [needsVerify, setNeedsVerify] = useState(false)
  const [needsPassword, setNeedsPassword] = useState(false)
  const [resent, setResent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  async function handleResend() {
    // Claim success only when the server actually accepted the request. A 429
    // still parses as JSON but must not flip the UI to "sent"; the previous
    // shape did.
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}))
        setError(
          typeof data?.error === 'string'
            ? data.error
            : t('errorRateLimited429'),
        )
        return
      }
      if (!res.ok) {
        setError(t('errorRequestLinkFailed'))
        return
      }
      setResent(true)
    } catch {
      setError(t('errorRequestLinkFailed'))
    }
  }

  async function handlePasskeyLogin() {
    setError('')
    if (!email) {
      setError(t('errorEnterEmailFirst'))
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
        throw new Error(data.error ?? t('errorNoPasskeyRegistered'))
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
        throw new Error(data.error ?? t('errorPasskeyVerifyFailed'))
      }
      const { preAuthToken } = await verRes.json()

      const result = await signIn('passkey-token', { preAuthToken, redirect: false })
      if (result?.error) {
        setError(t('errorPasskeySignInFailed'))
      } else {
        router.push(nextUrl)
        router.refresh()
      }
    } catch (err: unknown) {
      // The user dismissing the platform prompt is a choice, not an error.
      if ((err as { name?: string })?.name !== 'NotAllowedError') {
        setError(
          (err as { message?: string })?.message ??
            t('errorPasskeySignInFailed'),
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
    setNeedsPassword(false)
    setResent(false)
    setLoading(true)

    const result = await signIn('credentials', { email, password, redirect: false })

    setLoading(false)

    if (result?.error) {
      if (result.error.includes('TOO_MANY_ATTEMPTS')) {
        // Guessing rate limit tripped — a stuffing attack from the same IP or
        // a targeted attempt on this address. The message deliberately doesn't
        // name which axis: telling an attacker which axis they hit tells them
        // how to spread the attack.
        setError(t('errorTooManyAttempts'))
      } else if (result.error.includes('PASSWORD_NOT_SET')) {
        // The account was created by an administrator and has never had a
        // password. Resend issues a set-password link for exactly this case.
        setNeedsPassword(true)
      } else if (result.error.includes('EMAIL_NOT_VERIFIED')) {
        setNeedsVerify(true)
      } else {
        setError(t('errorNoMatch'))
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
        <h1 className="text-2xl font-bold tracking-tight">{t('welcomeBack')}</h1>
        <p className="mt-1.5 text-sm text-muted">{t('subhead')}</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-fields">
        <div className="space-y-1.5">
          <Label htmlFor="email">{t('emailLabel')}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder={t('emailPlaceholder')}
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">{t('passwordLabel')}</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder={t('passwordPlaceholder')}
          />
        </div>

        {/* The live region is always mounted, so a notice appearing inside it is
            announced. A region created at the same time as its content is not. */}
        <div aria-live="polite" className="empty:hidden space-y-3">
          {reason && !error && (
            <FormNotice tone={REASON_KEYS[reason].tone} title={t(REASON_KEYS[reason].titleKey)}>
              {t(REASON_KEYS[reason].bodyKey)}
            </FormNotice>
          )}
          {error && <FormNotice tone="danger" title={error} />}
          {needsPassword && (
            <FormNotice tone="warning" title={t('noPasswordYetTitle')}>
              {resent ? (
                <span>{t('linkOnWayTo', { email })}</span>
              ) : (
                <>
                  <span>{t('noPasswordYetBodyAdmin')} </span>
                  <button
                    type="button"
                    onClick={handleResend}
                    className="font-semibold text-[var(--accent)] hover:underline"
                  >
                    {t('emailMeLink')}
                  </button>
                </>
              )}
            </FormNotice>
          )}
          {needsVerify && (
            <FormNotice tone="warning" title={t('verifyEmailTitle')}>
              {resent ? (
                <span>{t('newVerificationOnWay', { email })}</span>
              ) : (
                <button
                  type="button"
                  onClick={handleResend}
                  className="font-semibold text-[var(--accent)] hover:underline"
                >
                  {t('resendVerification')}
                </button>
              )}
            </FormNotice>
          )}
        </div>

        <Button
          type="submit"
          size="touch"
          isLoading={loading}
          loadingBehavior="busy"
          isDisabled={busy}
          variant="brand"
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
              {t('signingIn')}
            </>
          ) : (
            t('signIn')
          )}
        </Button>

        <div className="flex items-center gap-4">
          <span className="h-px flex-1 bg-[var(--panel-border)]" />
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{t('or')}</span>
          <span className="h-px flex-1 bg-[var(--panel-border)]" />
        </div>

        <Button
          type="button"
          size="touch"
          onPress={handlePasskeyLogin}
          isLoading={passkeyLoading}
          loadingBehavior="busy"
          isDisabled={busy}
          variant="outline"
          className="press w-full"
        >
          {passkeyLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
              {t('waitingForPasskey')}
            </>
          ) : (
            <>
              <Fingerprint className="size-4" strokeWidth={2.3} />
              {t('signInWithPasskey')}
            </>
          )}
        </Button>
      </form>

      <p className="text-sm text-muted">
        {t('newHere')}{' '}
        <Link href="/register" className="font-semibold text-[var(--accent)] hover:underline">
          {t('createWorkspace')}
        </Link>
      </p>
    </div>
  )
}

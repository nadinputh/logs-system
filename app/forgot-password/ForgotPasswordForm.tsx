'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('forgotPassword')
  const tLogin = useTranslations('login')
  const tCommon = useTranslations('common')
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
            : t('errorTooManyAttempts'),
        )
      }
      if (!res.ok) throw new Error(t('errorRequestFailed'))
      setMailConfigured(data?.mailConfigured !== false)
      setDone(true)
    } catch (err: any) {
      setError(err?.message ?? t('errorRequestFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout
        headline={
          <>
            {t('headlineCheckEmailLine1')}
            <br />
            <span className="gradient-text">{t('headlineCheckEmailLine2')}</span>
          </>
        }
        subhead={t('subheadDone')}
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
              {mailConfigured ? tCommon('checkYourEmail') : t('mailNotSendingTitle')}
            </h1>
            <p className="mt-2 text-sm text-muted">
              {mailConfigured
                ? t.rich('resetLinkOnWay', {
                    email,
                    em: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
                  })
                : t('mailNotConfiguredBody')}
            </p>
          </div>
          <p className="text-sm text-muted">
            <Link
              href="/login"
              className="inline-block py-3 -my-3 font-semibold text-[var(--accent)] hover:underline"
            >
              {tCommon('backToSignIn')}
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
          {t('headlineLine1')}
          <br />
          <span className="gradient-text">{t('headlineLine2')}</span>
        </>
      }
      subhead={t('authSubhead')}
    >
      <div className="auth-stack">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-1.5 text-sm text-muted">
            {t('subtitle')}
          </p>
        </div>

        <div aria-live="polite" className="empty:hidden">
          {error && <FormNotice tone="danger" title={error} />}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">{tLogin('emailLabel')}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder={tLogin('emailPlaceholder')}
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
            {busy ? tCommon('sending') : t('emailMeResetLink')}
          </Button>
        </form>

        <p className="text-sm text-muted">
          {t('rememberedIt')}{' '}
          <Link
            href="/login"
            className="inline-block py-3 -my-3 font-semibold text-[var(--accent)] hover:underline"
          >
            {tCommon('backToSignIn')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}

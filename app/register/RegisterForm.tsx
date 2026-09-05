'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ArrowLeft, Loader2, MailCheck, MailWarning } from 'lucide-react'
import { FormNotice } from '@/components/auth/FormNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** Mirrors the server's RegisterSchema so the hint never overstates the rule. */
const MIN_PASSWORD = 8

export function RegisterForm() {
  const t = useTranslations('register')
  const tLogin = useTranslations('login')
  const tCommon = useTranslations('common')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  // Whether the verification mail actually left the server. Claiming it did
  // when it did not left registrants waiting on mail that never existed, and
  // sent them to "try a different address" — which orphans a second account.
  const [delivered, setDelivered] = useState(true)
  // Confirmation-card actions after the account is committed. `resend-verification`
  // is neutral about whether the address maps to an account, so it can't leak
  // enumeration — but it CAN answer "did that link ever leave the server?" via
  // its mailConfigured flag.
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

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
              ? tCommon('errorCheckDetails')
              : t('errorGeneric')
        throw new Error(detail)
      }
      setDelivered(data?.delivered !== false)
      setDone(true)
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message
      setError(
        typeof message === 'string' && message
          ? message
          : t('errorGeneric'),
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setResending(true)
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      // The endpoint is neutral about the address but reveals server mail
      // state. If mail isn't configured, admit that instead of claiming a
      // second send that also didn't happen.
      setDelivered(data?.mailConfigured !== false)
      setResent(true)
    } catch {
      // Deliberately silent — an unreachable /api endpoint doesn't change the
      // fact the account was created.
    } finally {
      setResending(false)
    }
  }

  if (done) {
    return (
      // A view change inside the same card, so it is crossfaded rather than
      // snapped — the confirmation reads as the form's outcome, not a new page.
      <div className="animate-panel-swap space-y-5">
        <span
          className={
            delivered
              ? 'inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]'
              : 'inline-flex size-11 items-center justify-center rounded-2xl bg-[var(--status-warning)]/10 text-[var(--status-warning)]'
          }
        >
          {delivered ? (
            <MailCheck className="size-5" strokeWidth={2.2} />
          ) : (
            <MailWarning className="size-5" strokeWidth={2.2} />
          )}
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {delivered ? tCommon('checkYourEmail') : t('workspaceReady')}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {delivered ? (
              t.rich('verificationOnWayTo', {
                email,
                em: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
              })
            ) : (
              t.rich('accountCreatedMailFailed', {
                email,
                em: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
              })
            )}
          </p>
        </div>
        {delivered ? (
          <div className="space-y-2 text-sm text-muted">
            <p>{t('nothingArrived')}</p>
            {resent ? (
              <p className="text-[var(--status-success)]">
                {t('linkRequestedAgain')}
              </p>
            ) : (
              // "Try a different address" used to sit here — but changing only the
              // email doesn't clear the form, and submitting again creates a
              // second user + a second team owned by the new address, silently
              // orphaning the first workspace. Resending the same address is the
              // correct recovery when mail is slow.
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={resending}
                className="font-semibold text-[var(--accent)] hover:underline disabled:opacity-60"
              >
                {resending ? tCommon('sending') : t('resendLinkTo', { email })}
              </button>
            )}
          </div>
        ) : (
          // Deliberately not offering "try a different address" here: the send
          // failed for a server-side reason, so a second attempt would only
          // orphan another account.
          <p className="text-sm text-muted">
            {t('tryDifferentAddressWontHelp')}
          </p>
        )}
        <Link
          href="/login"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline"
        >
          <ArrowLeft className="size-4" strokeWidth={2.4} />
          {tCommon('backToSignIn')}
        </Link>
      </div>
    )
  }

  return (
    <div className="animate-panel-swap auth-stack">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('title')}</h1>
        <p className="mt-1.5 text-sm text-muted">{t('subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-fields">
        <div className="space-y-1.5">
          <Label htmlFor="name">{t('nameLabel')}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            placeholder={t('namePlaceholder')}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="teamName">{t('teamNameLabel')}</Label>
          <Input
            id="teamName"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            required
            autoComplete="organization"
            placeholder={t('teamNamePlaceholder')}
          />
        </div>

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

        <div className="space-y-1.5">
          {/* The requirement sits on the label row, so it is read before typing
              rather than after — and it costs no extra line of height. */}
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="password">{tLogin('passwordLabel')}</Label>
            <span id="password-hint" className="text-xs text-muted">
              {t('passwordHint', { min: MIN_PASSWORD })}
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
            placeholder={t('passwordPlaceholder')}
          />
        </div>

        <div aria-live="polite" className="empty:hidden">
          {error && <FormNotice tone="danger" title={error} />}
        </div>

        <Button type="submit" size="touch" variant="brand" isLoading={loading} loadingBehavior="busy" className="w-full">
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={2.4} />
              {t('creatingWorkspace')}
            </>
          ) : (
            t('createAccount')
          )}
        </Button>
      </form>

      <p className="text-sm text-muted">
        {t('alreadyHaveAccount')}{' '}
        <Link href="/login" className="font-semibold text-[var(--accent)] hover:underline">
          {tLogin('signIn')}
        </Link>
      </p>
    </div>
  )
}

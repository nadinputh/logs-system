'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
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
  const t = useTranslations('resetPassword')
  const tCommon = useTranslations('common')
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
      setError(tCommon('errorRequestLinkFailed'))
    } finally {
      setResending(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError(t('passwordsDontMatch'))
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
              ? tCommon('errorCheckDetails')
              : t('errorGeneric')
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
      setError(err?.message ?? t('errorGeneric'))
    } finally {
      setBusy(false)
    }
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
          <h1 className="text-2xl font-bold tracking-tight">
            {status === 'expired' ? t('linkExpiredTitle') : t('resetYourPasswordTitle')}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {status === 'checking'
              ? t('checkingLink')
              : status === 'expired'
                ? t('expiredBody')
                : t('validBody')}
          </p>
        </div>

        <div aria-live="polite" className="empty:hidden">
          {error && <FormNotice tone="danger" title={error} />}
          {status === 'expired' && resent && (
            <FormNotice tone="success" title={t('newLinkOnWay')}>
              {t('resetLinkOnWayTo', { email: tokenEmail || t('fallbackThisAddress') })}
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
            {resending ? tCommon('sending') : t('emailMeNewLink')}
          </Button>
        )}

        {status === 'valid' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">{t('newPasswordLabel')}</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder={t('newPasswordPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">{t('confirmPasswordLabel')}</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" placeholder={t('confirmPasswordPlaceholder')} />
          </div>
          <Button
            size="touch"
            variant="brand"
            type="submit"
            className="w-full"
            isLoading={busy}
            loadingBehavior="busy"
          >
            {busy ? t('resetting') : t('resetAndSignIn')}
          </Button>
        </form>
        )}

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

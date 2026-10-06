'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormNotice } from '@/components/auth/FormNotice'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LegalConsent } from '@/components/legal/LegalConsent'

export default function SetPasswordPage() {
  const t = useTranslations('setPassword')
  const apiError = useApiError()
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
      setError(t('requestFailed'))
    } finally {
      setResending(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError(t('mismatch'))
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
      if (!res.ok) throw new Error(apiError(data, t('setFailed')))

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
      setError(err?.message ?? t('setFailed'))
    } finally {
      setBusy(false)
    }
  }

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
      <div className="auth-stack">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {status === 'expired' ? t('expiredTitle') : t('title')}
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            {status === 'checking'
              ? t('checking')
              : status === 'expired'
                ? t('expiredBody')
                : t('validBody')}
          </p>
        </div>

        <div aria-live="polite" className="empty:hidden">
          {error && <FormNotice tone="danger" title={error} />}
          {status === 'expired' && resent && (
            <FormNotice tone="success" title={t('newLinkTitle')}>
              {t('newLinkBody', { email: tokenEmail || t('yourInbox') })}
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
            {resending ? t('sending') : t('emailNew')}
          </Button>
        )}

        {status === 'valid' && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">{t('password')}</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder={t('passwordPlaceholder')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">{t('confirm')}</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" placeholder={t('confirmPlaceholder')} />
          </div>
          <LegalConsent action="setPassword" />
          <Button
            size="touch"
            variant="brand"
            type="submit"
            className="w-full"
            isLoading={busy}
            loadingBehavior="busy"
          >
            {busy ? t('activating') : t('submit')}
          </Button>
        </form>
        )}

        <p className="text-sm text-muted">
          <Link
            href="/login"
            className="inline-block py-3 -my-3 font-semibold text-[var(--accent)] hover:underline"
          >
            {t('backSignIn')}
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}

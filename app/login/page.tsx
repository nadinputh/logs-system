'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { startAuthentication } from '@simplewebauthn/browser'
import { MapPinned, Radio, ScrollText, ShieldCheck } from 'lucide-react'
import { LogoMark } from '@/components/Logo'
import { ParticleField } from '@/components/ParticleField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  async function handlePasskeyLogin() {
    setError('')
    if (!email) {
      setError('Enter your email to sign in with a passkey')
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
        throw new Error(data.error ?? 'No passkeys for this account')
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
        throw new Error(data.error ?? 'Verification failed')
      }
      const { preAuthToken } = await verRes.json()

      const result = await signIn('passkey-token', {
        preAuthToken,
        redirect: false,
      })
      if (result?.error) {
        setError('Passkey sign-in failed')
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        setError(err?.message ?? 'Passkey sign-in failed')
      }
    } finally {
      setPasskeyLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('Invalid email or password')
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <div className="relative min-h-screen flex">
      {/* Interactive physics dot field (antigravity-style) — shared with landing/scan */}
      <ParticleField className="fixed inset-0 z-0" />

      {/* Left — branding panel */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-700 via-cyan-700 to-teal-700 dark:from-slate-950 dark:via-cyan-950 dark:to-slate-900" />
        {/* White interactive dot field — same animation as the right side */}
        <ParticleField tone="onDark" className="absolute inset-0" />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <LogoMark className="w-6 h-6 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Kamnotheat</span>
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-4xl font-bold leading-tight">
                Enterprise<br />Check-In Engine
              </h1>
              <p className="mt-3 text-white/70 text-lg leading-relaxed">
                Secure, real-time visitor logging with QR, passkeys, and instant audit trails.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { Icon: ShieldCheck, label: 'Passkey Auth' },
                { Icon: MapPinned, label: 'Geo-fencing' },
                { Icon: ScrollText, label: 'Audit Ledger' },
                { Icon: Radio, label: 'Real-time' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-2.5 bg-white/10 rounded-xl px-4 py-3">
                  <f.Icon className="w-3.5 h-3.5 text-white/85 shrink-0" strokeWidth={2.25} />
                  <span className="text-sm font-medium">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/40 text-sm">
            © {new Date().getFullYear()} Kamnotheat. Enterprise grade.
          </p>
        </div>
      </div>

      {/* Right — auth form */}
      <div className="relative z-10 w-full lg:w-1/2 flex items-start lg:items-center justify-center p-6 pt-10 sm:pt-12 lg:p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <LogoMark className="w-[18px] h-[18px] text-white" />
            </div>
            <span className="font-bold text-foreground">Kamnotheat</span>
          </div>

          <div>
            <h2 className="text-2xl font-bold text-foreground">Welcome back</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">Staff and admin portal access</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">
                Email address
              </Label>
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
              <Label htmlFor="password">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-500">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full mt-2"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in…
                </span>
              ) : 'Sign In'}
            </Button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-2 text-xs uppercase tracking-wider text-muted-foreground/60">
                  Or
                </span>
              </div>
            </div>

            <Button
              type="button"
              onClick={handlePasskeyLogin}
              disabled={passkeyLoading || loading}
              variant="outline"
              className="w-full"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              {passkeyLoading ? 'Waiting for passkey…' : 'Sign in with Passkey'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

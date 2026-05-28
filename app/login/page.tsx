'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { startAuthentication } from '@simplewebauthn/browser'
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
    <div className="min-h-screen flex">
      {/* Left — branding panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sky-700 via-cyan-700 to-teal-700" />
        {/* Subtle grid overlay */}
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="text-lg font-bold tracking-tight">LogsSystem</span>
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
                { icon: 'Secure', label: 'Passkey Auth' },
                { icon: 'Fence', label: 'Geo-fencing' },
                { icon: 'Audit', label: 'Audit Ledger' },
                { icon: 'Live', label: 'Real-time' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-2.5 bg-white/10 rounded-xl px-4 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-white/85">{f.icon}</span>
                  <span className="text-sm font-medium">{f.label}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/40 text-sm">
            © {new Date().getFullYear()} LogsSystem. Enterprise grade.
          </p>
        </div>
      </div>

      {/* Right — auth form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <span className="font-bold text-foreground">LogsSystem</span>
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
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-600">{error}</p>
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

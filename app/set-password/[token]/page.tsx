'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { LogoMark } from '@/components/Logo'
import { ParticleField } from '@/components/ParticleField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function SetPasswordPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) {
      setError('Passwords do not match')
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
      if (!res.ok) throw new Error(data.error ?? 'Could not set password')

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
      setError(err?.message ?? 'Could not set password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-6">
      <ParticleField className="fixed inset-0 z-0" />
      <div className="relative z-10 w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <LogoMark className="w-[18px] h-[18px] text-white" />
          </div>
          <span className="font-bold text-foreground">Kamnotheat</span>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-foreground">Set your password</h2>
          <p className="mt-1.5 text-sm text-muted">Choose a password to activate your account.</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-2.5">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="Re-enter password" />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Activating…' : 'Set password & sign in'}
          </Button>
        </form>

        <p className="text-sm text-muted text-center">
          <Link href="/login" className="font-medium text-accent hover:underline">Back to sign in</Link>
        </p>
      </div>
    </div>
  )
}

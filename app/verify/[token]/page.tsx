'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogoMark } from '@/components/Logo'
import { ParticleField } from '@/components/ParticleField'
import { Button } from '@/components/ui/button'

export default function VerifyEmailPage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending')
  const [message, setMessage] = useState('')

  useEffect(() => {
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
    <div className="relative min-h-screen flex items-center justify-center p-6">
      <ParticleField className="fixed inset-0 z-0" />
      <div className="relative z-10 w-full max-w-sm space-y-6 text-center">
        <div className="flex items-center justify-center gap-2.5">
          <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
            <LogoMark className="w-[18px] h-[18px] text-white" />
          </div>
          <span className="font-bold text-foreground">Kamnotheat</span>
        </div>

        {status === 'pending' && (
          <p className="text-sm text-muted">Verifying your email…</p>
        )}

        {status === 'ok' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Email verified</h2>
            <p className="text-sm text-muted">Your account is active. You can sign in now.</p>
            <Button className="w-full" onClick={() => router.push('/login')}>Go to sign in</Button>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-foreground">Link expired</h2>
            <p className="text-sm text-muted">{message}</p>
            <Link href="/login" className="text-sm font-medium text-accent hover:underline">
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

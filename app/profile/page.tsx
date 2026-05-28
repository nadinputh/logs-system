'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { RoundedQRCode } from '@/components/qr/RoundedQRCode'
import { Clock3, RefreshCw, UserRound } from 'lucide-react'

export default function ProfilePage() {
  const [qrToken, setQrToken] = useState<string>('')
  const [countdown, setCountdown] = useState(25)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/users/session-qr')
      if (!res.ok) throw new Error(await res.text())
      const { token } = await res.json()
      setQrToken(token)
      setCountdown(25)
      setError(null)
    } catch {
      setError('Failed to generate QR. Are you logged in?')
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 25_000)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 25)), 1000)
    return () => clearInterval(tick)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-teal-50/20 flex items-start justify-center p-4 pt-10 pb-16">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3 shadow-sm shadow-cyan-200">
            <UserRound className="size-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Your Personal QR</h1>
          <p className="text-sm text-muted-foreground mt-1">Show this to a terminal scanner to check in</p>
        </div>

        {/* QR card */}
        <Card className="overflow-hidden">
          <CardContent className="p-4 flex flex-col items-center gap-4">
            {error ? (
              <div className="w-full bg-red-50 border border-red-200/60 rounded-xl px-4 py-3 text-center">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : qrToken ? (
              <div className="rounded-[1.75rem] border border-border/60 bg-white p-3 shadow-sm shadow-slate-200/70">
                <RoundedQRCode value={qrToken} size={240} />
              </div>
            ) : (
              <div className="w-[264px] h-[264px] bg-muted rounded-[1.75rem] animate-pulse" />
            )}

            {/* Countdown + refresh */}
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 bg-muted/50 rounded-xl px-3.5 py-2.5 text-center">
                <Clock3 className="mx-auto mb-1 size-4 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">Expires in</p>
                <p className="text-lg font-bold text-foreground tabular-nums">{countdown}s</p>
              </div>
              <Button
                type="button"
                onClick={refresh}
                variant="outline"
              >
                <RefreshCw className="size-4" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-center text-muted-foreground/60">
          This QR refreshes automatically every 25 seconds
        </p>
      </div>
    </div>
  )
}

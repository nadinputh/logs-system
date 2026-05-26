'use client'

import { useEffect, useState, useCallback } from 'react'
import QRCode from 'qrcode'

export default function ProfilePage() {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [countdown, setCountdown] = useState(25)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/users/session-qr')
      if (!res.ok) throw new Error(await res.text())
      const { token } = await res.json()
      const url = await QRCode.toDataURL(token, { width: 240, margin: 2 })
      setQrDataUrl(url)
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 flex items-start justify-center p-4 pt-10 pb-16">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3 shadow-sm shadow-indigo-200">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">Your Personal QR</h1>
          <p className="text-sm text-muted-foreground mt-1">Show this to a terminal scanner to check in</p>
        </div>

        {/* QR card */}
        <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="h-1.5 w-full gradient-primary" />
          <div className="p-6 flex flex-col items-center gap-5">
            {error ? (
              <div className="w-full bg-red-50 border border-red-200/60 rounded-xl px-4 py-3 text-center">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            ) : qrDataUrl ? (
              <div className="bg-white border border-border/40 rounded-xl p-3 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrDataUrl} alt="Personal QR code" width={240} height={240} />
              </div>
            ) : (
              <div className="w-[240px] h-[240px] bg-muted rounded-xl animate-pulse" />
            )}

            {/* Countdown + refresh */}
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 bg-muted/50 rounded-xl px-3.5 py-2.5 text-center">
                <p className="text-xs text-muted-foreground">Expires in</p>
                <p className="text-lg font-bold text-foreground tabular-nums">{countdown}s</p>
              </div>
              <button
                onClick={refresh}
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-muted/50 hover:bg-muted border border-border/40 px-4 py-3.5 rounded-xl transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh
              </button>
            </div>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground/60">
          This QR refreshes automatically every 25 seconds
        </p>
      </div>
    </div>
  )
}

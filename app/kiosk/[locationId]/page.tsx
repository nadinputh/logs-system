'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { RoundedQRCode } from '@/components/qr/RoundedQRCode'
import { Clock3, QrCode } from 'lucide-react'
import { useTranslations } from 'next-intl'

// Tokens live 15s (+5s verify tolerance); refreshing at 8s leaves a retry's
// worth of margin for slow networks and scanning a code already on screen.
const REFRESH_S = 8
const TOKEN_TTL_MS = 15_000

export default function KioskPage() {
  const t = useTranslations('kiosk')
  const { locationId } = useParams() as { locationId: string }
  const [qrToken, setQrToken] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_S)
  const fetchedAt = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/token?locationId=${locationId}`)
      if (res.status === 401 || res.status === 403) {
        setError(t('signInAsAManager'))
        return
      }
      if (!res.ok) throw new Error(t('failedToFetchToken'))
      const { token } = await res.json()
      setQrToken(token)
      fetchedAt.current = Date.now()
      setError(null)
      setCountdown(REFRESH_S)
    } catch {
      // A transient failure keeps the last QR up until it would stop scanning.
      if (Date.now() - fetchedAt.current > TOKEN_TTL_MS - 2_000) {
        setQrToken('')
        setError(t('unableToGenerateQrCode'))
      }
    }
  }, [locationId])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, REFRESH_S * 1000)
    return () => clearInterval(interval)
  }, [refresh])

  // Keep the display awake; the lock is released when the tab is hidden, so re-take it.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null
    const take = () => navigator.wakeLock?.request('screen').then((l) => (lock = l), () => {})
    take()
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && take())
    return () => { lock?.release() }
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => Math.max(c - 1, 0)), 1000)
    return () => clearInterval(tick)
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <p className="text-red-400 text-lg">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black gap-6 p-6 select-none">
      <div className="text-center">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/10">
          <QrCode className="size-7" />
        </div>
        <p className="text-white text-2xl font-semibold tracking-wide">{t('scanToCheckIn')}</p>
        <p className="mt-1 text-sm text-white/50">{t('pointYourCameraAtThe')}</p>
      </div>
      {qrToken ? (
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="rounded-[2rem] border border-border/60 bg-white p-3 shadow-sm shadow-slate-900/20">
              <RoundedQRCode value={`${window.location.origin}/scan/${locationId}?token=${qrToken}`} size={300} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="w-[324px] h-[324px] bg-white/10 rounded-[2rem] animate-pulse" />
      )}
      <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/60">
        <Clock3 className="size-4" />
        {t('refreshesIn', { seconds: countdown })}
      </p>
    </div>
  )
}

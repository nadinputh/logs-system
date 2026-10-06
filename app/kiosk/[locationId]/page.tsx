'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import { RoundedQRCode } from '@/components/qr/RoundedQRCode'
import { Clock3, Maximize, Minimize, MonitorOff } from 'lucide-react'
import { useTranslations } from 'next-intl'

// Tokens live 15s (+5s verify tolerance); refreshing at 8s leaves a retry's
// worth of margin for slow networks and scanning a code already on screen.
const REFRESH_S = 8
const TOKEN_TTL_MS = 15_000

// This screen is read from across a lobby, so the QR takes whatever the
// viewport can spare instead of a fixed 300px.
function fitQrSize() {
  return Math.round(Math.max(240, Math.min(window.innerWidth - 96, window.innerHeight * 0.48, 460)))
}

export default function KioskPage() {
  const t = useTranslations('kiosk')
  const { locationId } = useParams() as { locationId: string }
  const [qrToken, setQrToken] = useState<string>('')
  const [name, setName] = useState('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [canFullscreen, setCanFullscreen] = useState(false)
  const [qrSize, setQrSize] = useState(300)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(REFRESH_S)
  const fetchedAt = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/token?locationId=${locationId}`)
      if (res.status === 401) {
        // Session lapsed mid-run: go sign in and come straight back.
        window.location.href = `/login?next=${encodeURIComponent(`/kiosk/${locationId}`)}&reason=session_expired`
        return
      }
      if (res.status === 403) {
        setError(t('signInAsAManager'))
        return
      }
      if (!res.ok) throw new Error(t('failedToFetchToken'))
      const { token, name } = await res.json()
      setQrToken(token)
      setName(name ?? '')
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
    const onVisible = () => document.visibilityState === 'visible' && take()
    take()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release()
    }
  }, [])

  useEffect(() => {
    const sync = () => {
      setCanFullscreen(document.fullscreenEnabled)
      setIsFullscreen(!!document.fullscreenElement)
    }
    const resize = () => setQrSize(fitQrSize())
    sync()
    resize()
    document.addEventListener('fullscreenchange', sync)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      window.removeEventListener('resize', resize)
    }
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => Math.max(c - 1, 0)), 1000)
    return () => clearInterval(tick)
  }, [])

  const shell = 'relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-[#0f0f1e] p-6 text-white select-none'
  const wash = <div aria-hidden className="ambient-wash pointer-events-none absolute inset-0" />

  if (error) {
    return (
      <div className={shell}>
        {wash}
        <div className="relative z-10 max-w-md text-center">
          <MonitorOff className="mx-auto size-12 text-white/70" aria-hidden />
          <h1 className="mt-5 text-3xl font-extrabold tracking-[-0.015em]">{t('unavailableTitle')}</h1>
          <p role="alert" className="mt-3 text-lg text-white/80">{error}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={refresh}
              className="rounded-xl bg-white px-5 py-3 text-base font-semibold text-[#0f0f1e]"
            >
              {t('retry')}
            </button>
            <a
              href={`/login?next=${encodeURIComponent(`/kiosk/${locationId}`)}`}
              className="rounded-xl border border-white/30 px-5 py-3 text-base font-semibold text-white"
            >
              {t('signIn')}
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={shell}>
      {wash}
      <div className="relative z-10 text-center">
        {name && (
          <h1 className="text-[clamp(2rem,5vw,3.5rem)] font-extrabold leading-tight tracking-[-0.02em]">{name}</h1>
        )}
        <p className="mt-2 text-[clamp(1.5rem,3.5vw,2.5rem)] font-semibold text-white/90">{t('scanToCheckIn')}</p>
        <p className="mt-1 text-lg text-white/75">{t('pointYourCameraAtThe')}</p>
      </div>
      <div className="relative z-10">
        {qrToken ? (
          <div className="rounded-[2rem] bg-white p-4 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)]">
            <RoundedQRCode value={`${window.location.origin}/scan/${locationId}?token=${qrToken}`} size={qrSize} />
          </div>
        ) : (
          <div
            className="animate-pulse rounded-[2rem] bg-white/10"
            style={{ width: qrSize + 32, height: qrSize + 32 }}
          />
        )}
      </div>
      <div className="relative z-10 flex flex-wrap items-center justify-center gap-3">
        <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-base text-white/80">
          <Clock3 className="size-4" aria-hidden />
          {t('refreshesIn', { seconds: countdown })}
        </p>
        {canFullscreen && (
          <button
            type="button"
            onClick={() => (isFullscreen ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-base text-white/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {isFullscreen ? <Minimize className="size-4" aria-hidden /> : <Maximize className="size-4" aria-hidden />}
            {isFullscreen ? t('exitFullscreen') : t('fullscreen')}
          </button>
        )}
      </div>
    </div>
  )
}

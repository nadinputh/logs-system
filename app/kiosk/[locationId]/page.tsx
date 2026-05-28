'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { RoundedQRCode } from '@/components/qr/RoundedQRCode'
import { Clock3, QrCode } from 'lucide-react'

export default function KioskPage() {
  const { locationId } = useParams() as { locationId: string }
  const [qrToken, setQrToken] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(12)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/token?locationId=${locationId}`)
      if (!res.ok) throw new Error('Failed to fetch token')
      const { token } = await res.json()
      setQrToken(token)
      setCountdown(12)
    } catch {
      setError('Unable to generate QR code. Check KIOSK_SECRET env var.')
    }
  }, [locationId])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 12_000)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    const tick = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 12)), 1000)
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
        <p className="text-white text-2xl font-semibold tracking-wide">Scan to Check In</p>
        <p className="mt-1 text-sm text-white/50">Point your camera at the code below</p>
      </div>
      {qrToken ? (
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <div className="rounded-[2rem] border border-border/60 bg-white p-3 shadow-sm shadow-slate-900/20">
              <RoundedQRCode value={qrToken} size={300} />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="w-[324px] h-[324px] bg-white/10 rounded-[2rem] animate-pulse" />
      )}
      <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-white/60">
        <Clock3 className="size-4" />
        Refreshes in {countdown}s
      </p>
    </div>
  )
}

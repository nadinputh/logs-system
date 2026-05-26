'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import QRCode from 'qrcode'

export default function KioskPage() {
  const { locationId } = useParams() as { locationId: string }
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(12)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/kiosk/token?locationId=${locationId}`)
      if (!res.ok) throw new Error('Failed to fetch token')
      const { token } = await res.json()
      const url = await QRCode.toDataURL(token, { width: 300, margin: 2 })
      setQrDataUrl(url)
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-black gap-8 select-none">
      <p className="text-white text-2xl font-semibold tracking-wide">Scan to Check In</p>
      {qrDataUrl ? (
        <div className="bg-white p-4 rounded-2xl shadow-2xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Kiosk QR code" width={300} height={300} />
        </div>
      ) : (
        <div className="w-[300px] h-[300px] bg-gray-800 rounded-2xl animate-pulse" />
      )}
      <p className="text-gray-500 text-sm">Refreshes in {countdown}s</p>
    </div>
  )
}

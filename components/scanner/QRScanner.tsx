'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface QRScannerProps {
  onResult?: (result: string) => void
  redirectOnScan?: boolean
}

export default function QRScanner({ onResult, redirectOnScan = true }: QRScannerProps) {
  const router = useRouter()
  const [started, setStarted] = useState(false)
  const [error, setError] = useState('')
  const initialized = useRef(false)
  const scannerRef = useRef<any>(null)
  const divId = 'qr-reader'

  async function startScanner() {
    if (initialized.current) return
    initialized.current = true
    setError('')

    const { Html5Qrcode } = await import('html5-qrcode')
    scannerRef.current = new Html5Qrcode(divId)

    try {
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          scannerRef.current?.stop().catch(() => {})
          if (onResult) {
            onResult(decodedText)
          } else if (redirectOnScan) {
            try {
              const url = new URL(decodedText)
              router.push(url.pathname + url.search)
            } catch {
              setError('Invalid QR code')
              initialized.current = false
            }
          }
        },
        undefined
      )
      setStarted(true)
    } catch (err: any) {
      setError(err?.message ?? 'Camera access denied')
      initialized.current = false
    }
  }

  useEffect(() => {
    return () => {
      scannerRef.current?.stop().catch(() => {})
    }
  }, [])

  return (
    <div className="space-y-4">
      <div id={divId} className="w-full rounded-lg overflow-hidden" />
      {!started && (
        <Button onClick={startScanner} className="w-full" size="lg">
          Start Scanner
        </Button>
      )}
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
    </div>
  )
}

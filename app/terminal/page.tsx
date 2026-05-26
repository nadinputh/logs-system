'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'

const QRScanner = dynamic(() => import('@/components/scanner/QRScanner'), { ssr: false })

const LOCATION_TYPES = ['building', 'floor', 'room'] as const
type LocationType = (typeof LOCATION_TYPES)[number]

export default function TerminalPage() {
  const [locationId, setLocationId] = useState<string>('')
  const [locationType, setLocationType] = useState<LocationType>('room')
  const [scanning, setScanning] = useState(false)
  const [lastResult, setLastResult] = useState<string | null>(null)

  // Persist terminal location in localStorage
  useEffect(() => {
    const stored = localStorage.getItem('terminal_location')
    if (stored) {
      const parsed = JSON.parse(stored)
      setLocationId(parsed.locationId ?? '')
      setLocationType(parsed.locationType ?? 'room')
    }
  }, [])

  function saveLocation(id: string, type: LocationType) {
    localStorage.setItem('terminal_location', JSON.stringify({ locationId: id, locationType: type }))
  }

  async function handleScan(rawValue: string) {
    setScanning(false)
    if (!locationId) {
      toast.error('Configure the terminal location first')
      return
    }

    // The scanned value is a JWT session-qr token
    const token = rawValue.trim()
    try {
      const res = await fetch('/api/terminal/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, locationId, locationType }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? 'Scan failed')
        setLastResult(`Error: ${data.error}`)
      } else if (data.existing) {
        toast.info('Already checked in')
        setLastResult(`Already checked in — ${data.log.visitorName ?? 'user'}`)
      } else {
        toast.success(`Checked in: ${data.visitorName ?? 'user'}`)
        setLastResult(`✓ Checked in: ${data.visitorName ?? 'user'}`)
      }
    } catch {
      toast.error('Network error')
    }
  }

  const configured = Boolean(locationId)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-violet-50/20 flex items-start justify-center p-4 pt-10 pb-16">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3 shadow-sm shadow-indigo-200">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">Terminal</h1>
          <p className="text-sm text-muted-foreground mt-1">Fixed scanner for personal QR check-in</p>
        </div>

        {/* Config card */}
        <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="h-1.5 w-full gradient-primary" />
          <div className="p-5 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Location ID</label>
              <input
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                placeholder="MongoDB ObjectId of location"
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value)
                  saveLocation(e.target.value, locationType)
                }}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Location Type</label>
              <select
                className="w-full px-3.5 py-2.5 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                value={locationType}
                onChange={(e) => {
                  const v = e.target.value as LocationType
                  setLocationType(v)
                  saveLocation(locationId, v)
                }}
              >
                {LOCATION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {configured ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  Location configured
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                  Configure location above
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Scanner card */}
        <div className="bg-white rounded-2xl border border-border/60 shadow-sm overflow-hidden">
          <div className="h-1.5 w-full bg-violet-500" />
          <div className="p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-foreground text-sm">Scan User QR</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Ask the visitor to show their profile QR code</p>
            </div>
            {scanning ? (
              <>
                <QRScanner onResult={handleScan} redirectOnScan={false} />
                <button
                  onClick={() => setScanning(false)}
                  className="w-full text-sm text-muted-foreground hover:text-foreground py-2.5 rounded-xl hover:bg-muted/50 transition-all border border-border/40"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                onClick={() => setScanning(true)}
                disabled={!configured}
                className="w-full gradient-primary text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all shadow-sm shadow-indigo-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Start Scanner
              </button>
            )}
            {lastResult && (
              <p className="text-sm text-center text-muted-foreground">{lastResult}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

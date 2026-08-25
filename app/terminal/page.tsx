'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Description } from '@/components/ui/description'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/sonner'

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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-teal-50/20 flex items-start justify-center p-4 pt-10 pb-16">
      <div className="w-full max-w-sm space-y-4">
        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-3 shadow-sm shadow-cyan-200">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-foreground">Terminal</h1>
          <p className="text-sm text-muted mt-1">Fixed scanner for personal QR check-in</p>
        </div>

        {/* Config card */}
        <Card className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="terminal-location-id">Location ID</Label>
              <Input
                id="terminal-location-id"
                placeholder="507f1f77bcf86cd799439011"
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value)
                  saveLocation(e.target.value, locationType)
                }}
                required
              />
              <Description>MongoDB ObjectId of the configured location.</Description>
            </div>
            <div className="space-y-1.5">
              <Label>Location Type</Label>
              <Select
                value={locationType}
                onValueChange={(value) => {
                  if (!value) return
                  const nextLocationType = value as LocationType
                  setLocationType(nextLocationType)
                  saveLocation(locationId, nextLocationType)
                }}
                required
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
          </CardContent>
        </Card>

        {/* Scanner card */}
        <Card className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div>
              <h2 className="font-semibold text-foreground text-sm">Scan User QR</h2>
              <p className="text-xs text-muted mt-0.5">Ask the visitor to show their profile QR code</p>
            </div>
            {scanning ? (
              <>
                <QRScanner onResult={handleScan} redirectOnScan={false} />
                <Button
                  type="button"
                  onClick={() => setScanning(false)}
                  variant="outline"
                  className="w-full"
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={() => setScanning(true)}
                disabled={!configured}
                className="w-full"
              >
                Start Scanner
              </Button>
            )}
            {lastResult && (
              <p className="text-sm text-center text-muted">{lastResult}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { QrCode } from 'lucide-react'

interface Props {
  locationId: string
  locationType: 'building' | 'floor' | 'room'
  value: boolean
}

export default function DynamicQrToggle({ locationId, locationType, value }: Props) {
  const [on, setOn] = useState(value)
  const [saving, setSaving] = useState(false)

  async function toggle() {
    if (saving) return
    const next = !on
    setOn(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/locations/${locationId}?type=${locationType}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requireDynamicQr: next }),
      })
      if (!res.ok) throw new Error()
      toast.success(next ? 'Live kiosk QR required' : 'Static QR allowed')
    } catch {
      setOn(!next)
      toast.error('Failed to update QR requirement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={saving}
      aria-pressed={on}
      title="Only accept check-in from the live kiosk QR, not a printed one"
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 text-xs ${
        on ? 'bg-accent/15 border-accent text-accent font-medium' : 'text-muted hover:text-foreground'
      }`}
    >
      <QrCode className="w-3 h-3" />
      Live QR only
    </Button>
  )
}

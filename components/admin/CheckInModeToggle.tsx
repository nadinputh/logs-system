'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { MousePointerClick, Fingerprint } from 'lucide-react'

type Mode = 'click' | 'passkey'

interface Props {
  locationId: string
  value: Mode
  onChange?: (mode: Mode) => void
}

export default function CheckInModeToggle({ locationId, value, onChange }: Props) {
  const [mode, setMode] = useState<Mode>(value)
  const [saving, setSaving] = useState(false)

  async function update(next: Mode) {
    if (next === mode || saving) return
    const prev = mode
    setMode(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/locations/${locationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkInMode: next }),
      })
      if (!res.ok) throw new Error()
      onChange?.(next)
      toast.success(next === 'passkey' ? 'Passkey required' : 'Click check-in enabled')
    } catch {
      setMode(prev)
      toast.error('Failed to update check-in mode')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => update('click')}
        disabled={saving}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
          mode === 'click' ? 'bg-surface shadow-sm text-foreground font-medium' : 'text-muted hover:text-foreground'
        }`}
        title="Visitors can check in with a tap"
      >
        <MousePointerClick className="w-3 h-3" />
        Click
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => update('passkey')}
        disabled={saving}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
          mode === 'passkey' ? 'bg-white shadow-sm text-foreground font-medium' : 'text-muted hover:text-foreground'
        }`}
        title="Visitors must use Face ID / Touch ID"
      >
        <Fingerprint className="w-3 h-3" />
        Passkey
      </Button>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { MousePointerClick, Fingerprint } from 'lucide-react'
import { useTranslations } from 'next-intl'

type Mode = 'click' | 'passkey'
type LocationType = 'building' | 'floor' | 'room'

interface Props {
  locationId: string
  locationType: LocationType
  value: Mode
  onChange?: (mode: Mode) => void
}

export default function CheckInModeToggle({ locationId, locationType, value, onChange }: Props) {
  const t = useTranslations('adminToggles')
  const [mode, setMode] = useState<Mode>(value)
  const [saving, setSaving] = useState(false)

  async function update(next: Mode) {
    if (next === mode || saving) return
    const prev = mode
    setMode(next)
    setSaving(true)
    try {
      const res = await fetch(`/api/locations/${locationId}?type=${locationType}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkInMode: next }),
      })
      if (!res.ok) throw new Error()
      onChange?.(next)
      toast.success(next === 'passkey' ? t('passkeyRequired') : t('clickCheckInEnabled'))
    } catch {
      setMode(prev)
      toast.error(t('failedToUpdateCheckIn'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="group"
      aria-label={t('checkInMode')}
      className="inline-flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => update('click')}
        disabled={saving}
        aria-pressed={mode === 'click'}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
          mode === 'click' ? 'bg-surface shadow-sm text-foreground font-medium' : 'text-muted hover:text-foreground'
        }`}
        title={t('visitorsCanCheckInWith')}
      >
        <MousePointerClick className="w-3 h-3" />
        {t('click')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => update('passkey')}
        disabled={saving}
        aria-pressed={mode === 'passkey'}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
          mode === 'passkey' ? 'bg-surface shadow-sm text-foreground font-medium' : 'text-muted hover:text-foreground'
        }`}
        title={t('visitorsMustUseFaceId')}
      >
        <Fingerprint className="w-3 h-3" />
        {t('passkey')}
      </Button>
    </div>
  )
}

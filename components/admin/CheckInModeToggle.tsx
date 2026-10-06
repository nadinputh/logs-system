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
      className="flex w-full gap-1 rounded-xl bg-muted/40 p-1"
    >
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => update('click')}
        disabled={saving}
        aria-pressed={mode === 'click'}
        className={`h-auto flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          mode === 'click' ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted hover:text-foreground'
        }`}
        title={t('visitorsCanCheckInWith')}
      >
        <MousePointerClick className="size-4" />
        {t('click')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => update('passkey')}
        disabled={saving}
        aria-pressed={mode === 'passkey'}
        className={`h-auto flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          mode === 'passkey' ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted hover:text-foreground'
        }`}
        title={t('visitorsMustUseFaceId')}
      >
        <Fingerprint className="size-4" />
        {t('passkey')}
      </Button>
    </div>
  )
}

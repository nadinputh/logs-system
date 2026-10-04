'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { ExternalLink, QrCode } from 'lucide-react'
import { useTranslations } from 'next-intl'

interface Props {
  locationId: string
  locationType: 'building' | 'floor' | 'room'
  value: boolean
}

export default function DynamicQrToggle({ locationId, locationType, value }: Props) {
  const t = useTranslations('adminToggles')
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
      toast.success(next ? t('liveKioskQrRequired') : t('staticQrAllowed'))
    } catch {
      setOn(!next)
      toast.error(t('failedToUpdateQrRequirement'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={saving}
      aria-pressed={on}
      title={t('onlyAcceptCheckInFrom')}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 text-xs ${
        on ? 'bg-accent/15 border-accent text-accent font-medium' : 'text-muted hover:text-foreground'
      }`}
    >
      <QrCode className="w-3 h-3" />
      {t('liveQrOnly')}
    </Button>
    {on && (
      <a
        href={`/kiosk/${locationId}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/60 text-xs text-accent hover:bg-accent/10"
      >
        <ExternalLink className="w-3 h-3" />
        {t('openLiveQr')}
      </a>
    )}
    </>
  )
}

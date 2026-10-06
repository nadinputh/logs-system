'use client'

import { useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ExternalLink, MapPin, MonitorPlay, QrCode, TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'
import QRCodeDisplay from '@/components/admin/QRCodeDisplay'
import CheckInModeToggle from '@/components/admin/CheckInModeToggle'

type LocationType = 'building' | 'floor' | 'room'

interface Props {
  locationId: string
  locationType: LocationType
  initialLiveOnly: boolean
  initialCheckInMode: 'click' | 'passkey'
  qrUrl: string
  label: string
  sublabel?: string
  title: string
  subtitle: string
}

async function patchRequireDynamicQr(
  locationId: string,
  locationType: LocationType,
  next: boolean,
): Promise<boolean> {
  const res = await fetch(`/api/locations/${locationId}?type=${locationType}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requireDynamicQr: next }),
  }).catch(() => null)
  return !!res?.ok
}

/**
 * The one place a location's access is edited: how visitors identify (click or
 * passkey) and which QR proof is accepted. "Printed or live" shows the printable
 * code; "Live screen only" replaces it with the kiosk, because a printed code
 * would be refused (kioskGate) and printing one is a dead end. Switching to live
 * only asks first: it turns away every printed sign already on a door.
 */
export default function LocationQrPanel({
  locationId,
  locationType,
  initialLiveOnly,
  initialCheckInMode,
  qrUrl,
  label,
  sublabel,
  title,
  subtitle,
}: Props) {
  const t = useTranslations('adminQrPage')
  const tToggles = useTranslations('adminToggles')
  const [liveOnly, setLiveOnly] = useState(initialLiveOnly)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  async function commit(next: boolean) {
    setSaving(true)
    if (await patchRequireDynamicQr(locationId, locationType, next)) {
      setLiveOnly(next)
      toast.success(next ? tToggles('liveKioskQrRequired') : tToggles('staticQrAllowed'))
    } else {
      toast.error(tToggles('failedToUpdateQrRequirement'))
    }
    setConfirming(false)
    setSaving(false)
  }

  function choose(next: boolean) {
    if (saving || next === liveOnly) return
    if (next) setConfirming(true)
    else commit(false)
  }

  const option = (active: boolean) =>
    `flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
      active ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted hover:text-foreground'
    }`

  const kioskLink = (
    <a
      href={`/kiosk/${locationId}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-sm font-semibold text-accent underline-offset-4 hover:underline"
    >
      <ExternalLink className="size-4" aria-hidden />
      {t('openKiosk')}
    </a>
  )

  return (
    <div className="space-y-4">
      <section className="glass shadow-panel space-y-5 rounded-3xl p-5 print:hidden">
        <div>
          <p className="text-sm font-semibold">{t('identityLabel')}</p>
          <p className="mb-2 mt-0.5 text-xs text-muted">{t('identityHelp')}</p>
          <CheckInModeToggle
            locationId={locationId}
            locationType={locationType}
            value={initialCheckInMode}
          />
        </div>

        <div>
          <p id="qr-mode-label" className="mb-2 text-sm font-semibold">
            {t('modeLabel')}
          </p>
          <div
            role="radiogroup"
            aria-labelledby="qr-mode-label"
            className="flex gap-1 rounded-xl bg-muted/40 p-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={!liveOnly && !confirming}
              disabled={saving}
              onClick={() => choose(false)}
              className={option(!liveOnly && !confirming)}
            >
              {tToggles('printedOrLive')}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={liveOnly || confirming}
              disabled={saving}
              onClick={() => choose(true)}
              className={option(liveOnly || confirming)}
            >
              {tToggles('liveScreenOnly')}
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {liveOnly ? t('modeLiveOnlyHelp') : t('modePrintedHelp')}
          </p>

          {confirming && (
            <div
              role="alertdialog"
              aria-labelledby="live-confirm-title"
              className="mt-4 rounded-2xl border border-[var(--panel-border)] p-4"
            >
              <p id="live-confirm-title" className="flex items-center gap-2 text-sm font-semibold">
                <TriangleAlert className="size-4 text-[var(--status-warning)]" aria-hidden />
                {t('confirmTitle')}
              </p>
              <p className="mt-1 text-sm text-muted">{t('confirmBody')}</p>
              <div className="mt-3">{kioskLink}</div>
              <div className="mt-4 flex gap-2">
                <Button type="button" size="sm" onClick={() => commit(true)} disabled={saving}>
                  {t('confirmSwitch')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirming(false)}
                  disabled={saving}
                >
                  {t('confirmCancel')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {liveOnly ? (
        <section className="glass shadow-panel rounded-3xl p-6 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <MonitorPlay className="size-6" aria-hidden />
          </div>
          <h2 className="mt-3 text-lg font-semibold">{t('liveTitle')}</h2>
          <p className="mt-1 text-sm text-muted">{t('liveBody')}</p>
          <a
            href={`/kiosk/${locationId}`}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground"
          >
            <ExternalLink className="size-4" aria-hidden />
            {t('openKiosk')}
          </a>
          <p className="mt-3 text-xs text-muted">{t('staticDisabled')}</p>
        </section>
      ) : (
        <>
          {/* Hardcoded white and fixed neutrals: this card is data-qr-export-card,
              so it prints and exports the same regardless of app theme. */}
          <Card className="overflow-hidden bg-white" data-qr-export-card="true">
            <CardContent className="p-5 sm:p-6">
              <div className="mx-auto w-full max-w-[17.625rem]">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-900 text-white shadow-sm">
                    <QrCode className="size-5" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-neutral-900">{title}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-neutral-500">
                      <MapPin className="size-3.5" />
                      {subtitle}
                    </p>
                  </div>
                </div>
                <div className="flex justify-center">
                  <QRCodeDisplay
                    url={qrUrl}
                    label={label}
                    sublabel={sublabel}
                    exportTitle={title}
                    exportDescription={subtitle}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="text-center print:hidden">{kioskLink}</div>
        </>
      )}
    </div>
  )
}

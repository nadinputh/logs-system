import { useTranslations } from 'next-intl'

/**
 * Read-only "how does this place accept check-in" line. Editing lives on the
 * location's Access page (/admin/qr/[id]), so the list stays scannable and the
 * setting is visible at every width — the old per-row pills sat in a column
 * hidden below 1024px and carried their meaning in tooltips touch can't show.
 */
export default function AccessSummary({
  checkInMode,
  requireDynamicQr,
}: {
  checkInMode?: 'click' | 'passkey'
  requireDynamicQr?: boolean
}) {
  const t = useTranslations('adminToggles')
  return (
    <p className="mt-0.5 text-xs text-muted">
      {checkInMode === 'passkey' ? t('passkey') : t('click')}
      <span aria-hidden> · </span>
      <span className={requireDynamicQr ? 'font-medium text-accent' : undefined}>
        {requireDynamicQr ? t('liveScreenOnly') : t('printedOrLive')}
      </span>
    </p>
  )
}

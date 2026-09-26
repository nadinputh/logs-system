'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronDown, ShieldCheck } from 'lucide-react'

/**
 * The visitor half of the "two documents" shape: a one-time visitor scanning a
 * QR mid-action gets this collapsed one-liner near the check-in action, never
 * the full staff Privacy Policy. Collapsed by default so it never blocks the
 * action it sits beside.
 */
export function VisitorNotice() {
  const t = useTranslations('legal')
  const tCommon = useTranslations('common')
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-border bg-muted/30 px-3.5 py-3 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left font-medium text-muted"
      >
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4 shrink-0 text-[var(--accent)]" strokeWidth={2.2} />
          {t('visitorNoticeSummary')}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.2}
        />
        <span className="sr-only">{open ? t('visitorNoticeShowLess') : t('visitorNoticeLearnMore')}</span>
      </button>
      {open && (
        <div className="mt-2.5 space-y-2 text-muted">
          <p className="leading-relaxed">{t('visitorNoticeBody')}</p>
          <Link href="/privacy" className="inline-block text-xs font-medium text-accent hover:underline">
            {tCommon('privacyPolicy')}
          </Link>
        </div>
      )}
    </div>
  )
}

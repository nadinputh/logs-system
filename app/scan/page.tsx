import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import QRScanner from '@/components/scanner/QRScanner'
import { ParticleField } from '@/components/ParticleField'
import { LogoTile } from '@/components/Logo'
import { Camera, ScanLine, ShieldCheck } from 'lucide-react'

/**
 * The visitor's door. An Operate surface, not a Persuade one: someone is standing
 * at a reader with a phone, trying to get in. The task outranks expression.
 *
 * A server component — the scanner is the only client island, and because
 * html5-qrcode is imported inside the tap handler, the idle state paints from
 * HTML instead of waiting behind a `dynamic(ssr:false)` spinner.
 *
 * Width is deliberately not the landing's. This is the fallback surface — most
 * phones open the door's QR from the native camera and land straight on
 * /scan/[locationId] — so it is one centred column at every size rather than a
 * two-column composition built to fill a front door's width.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('scanHome')
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    robots: { index: false },
  }
}

const steps = [
  { Icon: Camera, key: 'step1' },
  { Icon: ScanLine, key: 'step2' },
  {
    Icon: ShieldCheck,
    key: 'step3',
    // Verified against components/location/CheckInOut.tsx: identity (name and
    // contact) -> identity step 2 (purpose, gender) -> checkin. "Confirm and
    // you are logged" skipped all of it; "give your name and confirm" then
    // understated it. This names the real shape.
  },
]

/**
 * Everything a check-in writes, stated before the camera opens rather than
 * after. Checked line by line against `lib/models/Log.ts`, the `POST /api/logs`
 * handler and `components/location/CheckInOut.tsx`:
 *
 * - automatic — server timestamp, the scanned `locationId`, `ipAddress`,
 *   `userAgent`, and a `deviceId` random UUID kept in this browser
 * - typed — `visitorName` required; contact, purpose and gender optional
 * - optional — nothing else is collected; no photo is taken (the camera only
 *   reads the QR, on-device)
 * - location — the browser may ask for position; the server stores only the
 *   inside/outside result (`geofenceStatus`), never the coordinates
 */
async function CaptureDisclosure() {
  const t = await getTranslations('scanHome')
  return (
    <>
      <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {t('disclosureHeading')}
      </h3>
      <dl className="space-y-2 text-xs leading-snug [@media(max-height:540px)]:space-y-1">
        <div>
          <dt className="font-semibold text-foreground">{t('autoTitle')}</dt>
          <dd className="text-muted">{t('autoBody')}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">{t('fromYouTitle')}</dt>
          <dd className="text-muted">{t('fromYouBody')}</dd>
        </div>
        <div>
          <dt className="font-semibold text-foreground">{t('optionalTitle')}</dt>
          <dd className="text-muted">{t('optionalBody')}</dd>
        </div>
      </dl>
    </>
  )
}

export default async function ScanPage() {
  const t = await getTranslations('scanHome')
  const tCommon = await getTranslations('common')
  const tNotice = await getTranslations('scanNotice')
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* The same two atmosphere layers as the landing. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-screen [mask-image:linear-gradient(to_bottom,#000_55%,transparent_100%)]"
      >
        <div className="ambient-wash absolute inset-0" />
        <ParticleField className="absolute inset-0" />
      </div>

      <div className="relative z-10">
        <a
          href="#main"
          className="glass sr-only rounded-full px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
        >
          {tCommon('skipToContent')}
        </a>

        {/* No ThemeToggle, no Sign in. Both served staff on the one surface whose
            user is a stranger here for twenty seconds — and "Sign in" was the
            highest-contrast control on the page at load, on a page whose visitor
            has no account. Dark mode still follows the OS through next-themes;
            the staff route lives at the foot of the page where it belongs. The
            wordmark is no longer hidden on phones: this page asks for a camera,
            so it has to say who is asking. */}
        <header className="border-b border-[var(--panel-border)]">
          <nav aria-label={tNotice('primaryNav')} className="shell">
            <div className="mx-auto flex h-16 w-full max-w-[34rem] items-center sm:h-[4.5rem]">
            <Link
              href="/landing"
              aria-label={tCommon('homeAriaLabel')}
              className="group flex items-center gap-3 rounded-2xl"
            >
              <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
              <span>
                <span className="block text-sm font-semibold tracking-tight">Kamnotheat</span>
                <span className="block text-xs text-muted">{tCommon('tagline')}</span>
              </span>
            </Link>
            </div>
          </nav>
        </header>

        <main id="main" className="shell pb-20 pt-8 sm:pt-12 [@media(max-height:540px)]:pt-3">
          <div className="mx-auto w-full max-w-[34rem]">
            <h1 className="text-balance text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-[1.1] tracking-[-0.02em]">
              {t('headingBefore')}<span className="gradient-text">{t('headingAccent')}</span>
            </h1>
            {/* The owner confirmed this is the fallback: the ordinary way in is a
                phone's own camera opening the door code. Saying so is the first
                thing a visitor needs, because it names why they are here and
                offers the faster route back. The capture list that used to be
                bolted onto this line now sits in full directly above the
                button, where consent belongs. */}
            <p className="mt-3 text-pretty text-muted [@media(max-height:540px)]:mt-1.5">
              {t('lead')}
            </p>

            {/* The task, as high as the page can put it. */}
            <div className="glass shadow-panel mt-6 rounded-3xl p-5 sm:p-6 [@media(max-height:540px)]:mt-3 [@media(max-height:540px)]:p-4">
              <QRScanner idlePlaceholder={<CaptureDisclosure />} />
            </div>

            {/* What stays below the button is reassurance, not disclosure: it
                describes what does *not* happen and what is not required. The
                heading went with it — three eyebrow-styled section heads in a
                row made every part of this page read as metadata. */}
            <p className="mt-5 text-sm text-muted">
              {t('reassurance')}{' '}
              <span className="font-semibold text-foreground">
                {t('noAccount')}
              </span>
            </p>

            <h2 className="mt-10 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {t('whatHappens')}
            </h2>
            <ol className="mt-4 space-y-5">
              {steps.map(({ Icon, key }, i) => (
                <li key={key} className="flex items-start gap-3.5">
                  <span className="glass inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-[var(--accent)]">
                    <Icon className="size-4" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span aria-hidden className="tabular text-xs font-semibold text-muted">
                        {i + 1}
                      </span>
                      <span className="font-semibold tracking-tight">{t(`${key}Title`)}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">{t(`${key}Text`)}</span>
                  </span>
                </li>
              ))}
            </ol>

            <p className="mt-10 border-t border-[var(--panel-border)] pt-5 text-sm text-muted">
              {t('staffPrompt')}{' '}
              <Link
                href="/login"
                className="inline-block py-3 -my-3 font-semibold text-[var(--accent)] hover:underline"
              >
                {t('openConsole')}
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { ParticleField } from '@/components/ParticleField'
import { RecordPanel } from '@/components/landing/RecordPanel'
import { LogoTile } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Fingerprint,
  LockKeyhole,
  QrCode,
  RadioTower,
  Server,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from 'lucide-react'

/**
 * The front door. Per PRODUCT.md this surface is a router, not a sales page:
 * staff and admins go to the console, one-time visitors go to the scanner.
 *
 * Deliberately a server component with no framer-motion. The previous version
 * rendered its hero at `opacity: 0` until hydration finished, which put the LCP
 * text behind ~47 KB of animation runtime. Everything here paints from HTML.
 *
 * Two client islands only: ThemeToggle, and the ParticleField behind the hero —
 * the locating field, which paints a static frame first and animates solely on
 * pointer-capable devices while it is actually on screen.
 */

export const metadata: Metadata = {
  title: 'Kamnotheat — Secure check-in logging',
  description:
    'An immutable check-in/out ledger. Passkeys, QR and kiosk flows at the door; server-authoritative time and a tamper-evident audit trail in the record.',
  openGraph: {
    title: 'Kamnotheat — Secure check-in logging',
    description:
      'Zero-friction check-ins. Cryptographic certainty. An append-only presence ledger for your estate.',
    type: 'website',
  },
}

type PairingItem = { Icon: LucideIcon; label: string; detail: string }

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default async function LandingPage() {
  const t = await getTranslations('landing')
  const tCommon = await getTranslations('common')

  // Data — every value here is a real system constant (PRODUCT.md: never
  // fabricate proof, so there are no adoption or customer numbers). Built
  // inside the component (not at module scope) because translating the
  // labels needs the request-scoped `t`.
  const parameters = [
    { label: t('paramAutoCheckout'), value: '12', unit: t('paramAutoCheckoutUnit') },
    { label: t('paramKioskQr'), value: '15', unit: t('paramKioskQrUnit') },
    { label: t('paramIdempotency'), value: '256', unit: t('paramIdempotencyUnit') },
    { label: t('paramLedger'), value: t('paramLedgerValue'), unit: t('paramLedgerUnit') },
  ]

  const frictionless: PairingItem[] = [
    { Icon: Fingerprint, label: t('passkeys'), detail: t('passkeysDetail') },
    { Icon: QrCode, label: t('qr'), detail: t('qrDetail') },
    { Icon: RadioTower, label: t('kioskLoop'), detail: t('kioskLoopDetail') },
    { Icon: Smartphone, label: t('reverseScan'), detail: t('reverseScanDetail') },
  ]

  const certainty: PairingItem[] = [
    { Icon: LockKeyhole, label: t('ledgerAppendOnly'), detail: t('ledgerAppendOnlyDetail') },
    { Icon: CheckCircle2, label: t('idempotentWrites'), detail: t('idempotentWritesDetail') },
    { Icon: Clock, label: t('serverTime'), detail: t('serverTimeDetail') },
    { Icon: ShieldCheck, label: t('auditTrail'), detail: t('auditTrailDetail') },
  ]

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* Atmosphere, in two layers: one washed ground, and the locating field over
          it. Probe the field with the cursor and the points inside the radius warm
          toward the accent — the shape of the question the product answers, not a
          depiction of a geofence check the engine performs (it does not; see
          ParticleField's header). The field is the only grid here; ruling it as
          well just read as a table.

          Anchored to the hero rather than fixed to the viewport, so it scrolls away
          from the dense sections below and the field's observer can stop the loop. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[115vh] max-h-[1200px] min-h-[820px] [mask-image:linear-gradient(to_bottom,#000_58%,transparent_100%)]"
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

        {/* ------------------------------------------------------------- Nav */}
        <header className="sticky top-0 z-40 border-b border-[var(--panel-border)] bg-background/70 backdrop-blur-xl">
          <nav
            aria-label={t('primaryNavLabel')}
            className="shell flex h-16 items-center gap-3 sm:h-[4.5rem]"
          >
            <Link
              href="/landing"
              aria-label={tCommon('homeAriaLabel')}
              className="group flex items-center gap-3 rounded-2xl"
            >
              <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
              <span className="hidden sm:block">
                <span className="block text-sm font-bold tracking-tight">Kamnotheat</span>
                <span className="block text-xs text-muted">{tCommon('tagline')}</span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              {/* Unlike NavBar (which falls back to a hamburger menu), this
                  header has no mobile overflow menu, so the switcher stays
                  visible at every width rather than hiding below `sm` — a
                  hidden-on-mobile switcher here would leave phone visitors
                  with no way to change language at all. */}
              <LanguageSwitcher />
              <ThemeToggle />
              <Link
                href="/login"
                className="gradient-cta shadow-signal press inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-[var(--accent-foreground)] hover:scale-[1.03]"
              >
                {tCommon('openConsole')}
                <ArrowRight className="size-4" strokeWidth={2.4} />
              </Link>
            </div>
          </nav>
        </header>

        <main id="main">
          {/* ---------------------------------------------------------- Hero */}
          <section className="shell grid items-center gap-14 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-20 lg:py-28">
            <div>
              <h1 className="text-balance text-[clamp(2.5rem,6vw,4.25rem)] font-extrabold leading-[1.03] tracking-[-0.025em]">
                {t('heroTitleLine1')}
                <br />
                <span className="gradient-text">{t('heroTitleLine2')}</span>
              </h1>

              <p className="mt-7 max-w-[54ch] text-pretty text-lg leading-relaxed text-muted">
                {t('heroSubhead')}
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/login"
                  className="gradient-cta shadow-signal press inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold text-[var(--accent-foreground)] hover:scale-[1.02]"
                >
                  {tCommon('openConsole')}
                  <ArrowRight className="size-4" strokeWidth={2.4} />
                </Link>
              </div>

              {/* The visitor's real door is not on this page. Every phone since
                  iOS 11 opens a QR from the native camera straight onto
                  /scan/[locationId], so a pill here reading "Scan to check in"
                  sent people to the in-app scanner as if it were the way in —
                  while /scan itself was rebuilt around the opposite premise,
                  that you arrive there because the camera already failed. The
                  routing now says what the product actually does: the code at
                  the door first, this page's scanner as the recovery. */}
              <p className="mt-6 max-w-[52ch] text-sm text-muted">
                {t('visitorPrompt')}{' '}
                <Link
                  href="/scan"
                  className="inline-block py-3 -my-3 font-semibold text-[var(--accent)] hover:underline"
                >
                  {t('visitorScanLink')}
                </Link>
                .
              </p>

              <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-sm text-muted">
                <li className="inline-flex items-center gap-2">
                  <ShieldCheck
                    className="size-4 text-[var(--accent)]"
                    strokeWidth={2.4}
                  />
                  {tCommon('factAppendOnly')}
                </li>
                <li className="inline-flex items-center gap-2">
                  <Server className="size-4 text-[var(--accent)]" strokeWidth={2.4} />
                  {tCommon('factMongo')}
                </li>
                <li className="inline-flex items-center gap-2">
                  <LockKeyhole
                    className="size-4 text-[var(--accent)]"
                    strokeWidth={2.4}
                  />
                  {tCommon('factRoleScoped')}
                </li>
              </ul>
            </div>

            <RecordPanel />
          </section>

          {/* ------------------------------------------------- Operating spec */}
          <section
            aria-labelledby="parameters-heading"
            className="border-y border-[var(--panel-border)]"
          >
            <h2 id="parameters-heading" className="sr-only">
              {t('parametersHeading')}
            </h2>
            <dl className="shell grid grid-cols-2 gap-x-8 gap-y-8 py-10 sm:py-12 lg:grid-cols-4">
              {/* Rule above rather than beside, so every column starts on the same
                  left spine as the hero, the section heads and the footer. */}
              {parameters.map(({ label, value, unit }) => (
                <div key={label} className="border-t border-[var(--panel-border)] pt-4">
                  <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                    {label}
                  </dt>
                  <dd className="tabular mt-2 text-xl font-bold tracking-tight">
                    {value}{' '}
                    <span className="text-sm font-medium text-muted">{unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ------------------------------------------------------ The pairing */}
          {/* Three equal columns across the full shell: the argument sets up the
              two lists rather than sitting above them, so the width is used. */}
          <section className="shell grid gap-x-10 gap-y-14 py-20 sm:py-28 lg:grid-cols-3">
            <div>
              <h2 className="text-balance text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">
                {t('pairingHeading')}
              </h2>
              <p className="mt-5 text-pretty text-lg text-muted">
                {t('pairingSubhead')}
              </p>
            </div>

            <PairingColumn title={t('frictionlessTitle')} items={frictionless} />
            <PairingColumn title={t('certaintyTitle')} items={certainty} />
          </section>
        </main>

        {/* -------------------------------------------------------- Footer */}
        <footer className="border-t border-[var(--panel-border)]">
          <div className="shell flex flex-col items-center justify-between gap-5 py-10 sm:flex-row">
            <div className="flex items-center gap-3">
              <LogoTile className="size-9 rounded-xl" />
              <span className="text-sm font-semibold">Kamnotheat</span>
            </div>
            <p className="text-sm text-muted">
              {t('footerTagline')}
            </p>
          </div>
        </footer>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function PairingColumn({ title, items }: { title: string; items: PairingItem[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
        {title}
      </h3>
      <ul className="mt-7 space-y-6">
        {items.map(({ Icon, label, detail }) => (
          <li key={label} className="flex items-start gap-4">
            <span className="glass inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-[var(--accent)]">
              <Icon className="size-[18px]" strokeWidth={2.2} />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold tracking-tight">{label}</span>
              <span className="mt-0.5 block text-sm text-muted">{detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

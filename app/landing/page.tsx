import type { Metadata } from 'next'
import Link from 'next/link'
import { ParticleField } from '@/components/ParticleField'
import { RecordPanel } from '@/components/landing/RecordPanel'
import { LogoTile } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
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

/* -------------------------------------------------------------------------- */
/*  Data — every value here is a real system constant (PRODUCT.md: never       */
/*  fabricate proof, so there are no adoption or customer numbers).            */
/* -------------------------------------------------------------------------- */

const parameters = [
  { label: 'Auto-checkout window', value: '12', unit: 'hours' },
  { label: 'Kiosk QR lifetime', value: '15', unit: 'seconds' },
  { label: 'Idempotency key', value: '256', unit: 'bit sha-256' },
  { label: 'Ledger writes', value: 'Append', unit: 'only, always' },
]

type PairingItem = { Icon: LucideIcon; label: string; detail: string }

const frictionless: PairingItem[] = [
  { Icon: Fingerprint, label: 'Passkeys & FIDO2', detail: 'Secure enclave, no password' },
  { Icon: QrCode, label: 'Static & dynamic QR', detail: 'Printed room codes or live kiosk' },
  { Icon: RadioTower, label: 'Rotating kiosk loop', detail: 'Signed token, 15s lifetime' },
  { Icon: Smartphone, label: 'Reverse-scan terminal', detail: 'Your QR, their scanner' },
]

const certainty: PairingItem[] = [
  { Icon: LockKeyhole, label: 'Append-only ledger', detail: 'No update path exists' },
  { Icon: CheckCircle2, label: 'Idempotent writes', detail: 'Retries can never double-log' },
  { Icon: Clock, label: 'Server-authoritative time', detail: 'Client clocks are ignored' },
  { Icon: ShieldCheck, label: 'Separate audit trail', detail: 'Corrections never overwrite' },
]

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function LandingPage() {
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
          Skip to content
        </a>

        {/* ------------------------------------------------------------- Nav */}
        <header className="sticky top-0 z-40 border-b border-[var(--panel-border)] bg-background/70 backdrop-blur-xl">
          <nav
            aria-label="Primary"
            className="shell flex h-16 items-center gap-3 sm:h-[4.5rem]"
          >
            <Link
              href="/landing"
              aria-label="Kamnotheat — home"
              className="group flex items-center gap-3 rounded-2xl"
            >
              <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
              <span className="hidden sm:block">
                <span className="block text-sm font-bold tracking-tight">Kamnotheat</span>
                <span className="block text-xs text-muted">Secure check-in logging</span>
              </span>
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle />
              <Link
                href="/login"
                className="gradient-cta shadow-signal press inline-flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-[var(--accent-foreground)] hover:scale-[1.03]"
              >
                Open the console
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
                Zero-friction check-ins.
                <br />
                <span className="gradient-text">Cryptographic certainty.</span>
              </h1>

              <p className="mt-7 max-w-[54ch] text-pretty text-lg leading-relaxed text-muted">
                An immutable check-in/out ledger. Passkeys, QR and kiosk flows make
                entry effortless; server-authoritative time and a tamper-evident audit
                trail make the record impossible to quietly rewrite.
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/login"
                  className="gradient-cta shadow-signal press inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold text-[var(--accent-foreground)] hover:scale-[1.02]"
                >
                  Open the console
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
                Here to check in? Point your phone&apos;s camera at the QR code posted at
                your location — it opens your check-in directly.{' '}
                <Link
                  href="/scan"
                  className="inline-block py-3 -my-3 font-semibold text-[var(--accent)] hover:underline"
                >
                  If it doesn&apos;t open, scan it here
                </Link>
                .
              </p>

              <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-sm text-muted">
                <li className="inline-flex items-center gap-2">
                  <ShieldCheck
                    className="size-4 text-[var(--accent)]"
                    strokeWidth={2.4}
                  />
                  Append-only by construction
                </li>
                <li className="inline-flex items-center gap-2">
                  <Server className="size-4 text-[var(--accent)]" strokeWidth={2.4} />
                  Runs in your MongoDB Atlas
                </li>
                <li className="inline-flex items-center gap-2">
                  <LockKeyhole
                    className="size-4 text-[var(--accent)]"
                    strokeWidth={2.4}
                  />
                  Role-scoped access
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
              Operating parameters
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
                Frictionless at the door. Certain in the record.
              </h2>
              <p className="mt-5 text-pretty text-lg text-muted">
                Most systems trade one for the other — a fast turnstile with a soft log,
                or a rigorous log nobody wants to use. The same event is both here, and
                that pairing is the whole product.
              </p>
            </div>

            <PairingColumn title="Frictionless entry" items={frictionless} />
            <PairingColumn title="Cryptographic certainty" items={certainty} />
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
              Secure check-in logging · Immutable by design
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

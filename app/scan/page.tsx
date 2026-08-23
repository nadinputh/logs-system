import type { Metadata } from 'next'
import Link from 'next/link'
import QRScanner from '@/components/scanner/QRScanner'
import { ParticleField } from '@/components/ParticleField'
import { LogoTile } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { ArrowRight, Camera, ScanLine, ShieldCheck } from 'lucide-react'

/**
 * The visitor's door. An Operate surface, not a Persuade one: someone is standing
 * at a reader with a phone, trying to get in. The task outranks expression.
 *
 * A server component — the scanner is the only client island, and because
 * html5-qrcode is imported inside the tap handler, the idle state paints from
 * HTML instead of waiting behind a `dynamic(ssr:false)` spinner.
 *
 * Width is deliberately not the landing's. A camera viewfinder does not want
 * 1440px; the shell aligns the spine with the landing, and the desktop width is
 * spent on supporting content beside the task rather than on stretching it.
 */

export const metadata: Metadata = {
  title: 'Scan to check in — Kamnotheat',
  description:
    'Point your camera at the QR code posted at your location to record your entry.',
  robots: { index: false },
}

const steps = [
  {
    Icon: Camera,
    title: 'Point your camera',
    text: 'Aim at the QR code posted at your door, kiosk, or terminal.',
  },
  {
    Icon: ScanLine,
    title: 'It reads itself',
    text: 'No button to press — the code is picked up the moment it is in frame.',
  },
  {
    Icon: ShieldCheck,
    title: 'Confirm and you are logged',
    text: 'Your entry is written once, with the time set by the server.',
  },
]

export default function ScanPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      {/* The same two atmosphere layers as the landing. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
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

        <header className="sticky top-0 z-40 border-b border-[var(--panel-border)] bg-background/70 backdrop-blur-xl">
          <nav aria-label="Primary" className="shell flex h-16 items-center gap-3 sm:h-[4.5rem]">
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
                className="press inline-flex h-11 items-center gap-2 rounded-full border border-border bg-overlay/80 px-4 text-sm font-semibold shadow-sm hover:bg-accent/10 hover:text-[var(--accent)]"
              >
                Sign in
                <ArrowRight className="size-4" strokeWidth={2.4} />
              </Link>
            </div>
          </nav>
        </header>

        <main id="main" className="shell pb-24 pt-12 sm:pt-16">
          <div className="max-w-[44ch]">
            <h1 className="text-balance text-[clamp(2rem,4.5vw,3rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">
              Scan to <span className="gradient-text">check in</span>
            </h1>
            <p className="mt-4 text-pretty text-lg text-muted">
              Point your camera at the QR code posted at your location. Your entry is
              recorded once and cannot be edited afterwards.
            </p>
          </div>

          <div className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] lg:gap-16">
            {/* The task */}
            <div className="glass shadow-panel rounded-3xl p-5 sm:p-6">
              <QRScanner />
            </div>

            {/* What to expect, as a sequence rather than three identical cards */}
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
                What happens
              </h2>
              <ol className="mt-7 space-y-7">
                {steps.map(({ Icon, title, text }, i) => (
                  <li key={title} className="flex items-start gap-4">
                    <span className="glass inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-[var(--accent)]">
                      <Icon className="size-[18px]" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className="tabular text-xs font-semibold text-muted">
                          {i + 1}
                        </span>
                        <span className="font-semibold tracking-tight">{title}</span>
                      </span>
                      <span className="mt-1 block text-sm text-muted">{text}</span>
                    </span>
                  </li>
                ))}
              </ol>

              <p className="mt-10 border-t border-[var(--panel-border)] pt-6 text-sm text-muted">
                Staff or admin?{' '}
                <Link
                  href="/login"
                  className="font-semibold text-[var(--accent)] hover:underline"
                >
                  Open the console
                </Link>
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

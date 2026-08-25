import type { Metadata } from 'next'
import Link from 'next/link'
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
    title: 'Give your name and confirm',
    // Was "Confirm and you are logged", which skipped the form entirely. The
    // next screen requires a full name; contact, purpose, gender and a photo
    // are each optional (verified in components/location/CheckInOut.tsx).
    text: 'Only your name is required. Your entry is then written once, timed by the server.',
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

        {/* No ThemeToggle, no Sign in. Both served staff on the one surface whose
            user is a stranger here for twenty seconds — and "Sign in" was the
            highest-contrast control on the page at load, on a page whose visitor
            has no account. Dark mode still follows the OS through next-themes;
            the staff route lives at the foot of the page where it belongs. The
            wordmark is no longer hidden on phones: this page asks for a camera,
            so it has to say who is asking. */}
        <header className="border-b border-[var(--panel-border)]">
          <nav aria-label="Primary" className="shell flex h-16 items-center sm:h-[4.5rem]">
            <Link
              href="/landing"
              aria-label="Kamnotheat — home"
              className="group flex items-center gap-3 rounded-2xl"
            >
              <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
              <span>
                <span className="block text-sm font-bold tracking-tight">Kamnotheat</span>
                <span className="block text-xs text-muted">Secure check-in logging</span>
              </span>
            </Link>
          </nav>
        </header>

        <main id="main" className="shell pb-20 pt-8 sm:pt-12">
          <div className="mx-auto w-full max-w-[34rem]">
            <h1 className="text-balance text-[clamp(1.75rem,4vw,2.25rem)] font-extrabold leading-[1.1] tracking-[-0.02em]">
              Scan to <span className="gradient-text">check in</span>
            </h1>
            {/* Both halves in one line, above the fold: what is permanent *and*
                what it contains. The previous lede repeated step 1 verbatim and
                pushed the task off screen. */}
            <p className="mt-3 text-pretty text-muted">
              Recorded once and never edited — the time, the code you scan, and your name.
            </p>

            {/* The task, as high as the page can put it. */}
            <div className="glass shadow-panel mt-6 rounded-3xl p-5 sm:p-6">
              <QRScanner />
            </div>

            <div className="mt-6 rounded-2xl border border-[var(--panel-border)] p-4">
              <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                What gets recorded
              </h2>
              <p className="mt-2.5 text-sm text-muted">
                The time, the code you scan, and{' '}
                <span className="font-semibold text-foreground">your name</span>. Your IP
                address, browser, and a random ID for this browser are stored alongside it.
                Contact details, purpose and a photo are optional — you can skip all three.
              </p>
              <p className="mt-2 text-sm text-muted">
                The camera feed never leaves your device; only the code is read. Entries are
                readable by this organisation&apos;s staff.
              </p>
            </div>

            <h2 className="mt-10 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              What happens
            </h2>
            <ol className="mt-4 space-y-5">
              {steps.map(({ Icon, title, text }, i) => (
                <li key={title} className="flex items-start gap-3.5">
                  <span className="glass inline-flex size-9 shrink-0 items-center justify-center rounded-xl text-[var(--accent)]">
                    <Icon className="size-4" strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="tabular text-xs font-semibold text-muted">{i + 1}</span>
                      <span className="font-semibold tracking-tight">{title}</span>
                    </span>
                    <span className="mt-0.5 block text-sm text-muted">{text}</span>
                  </span>
                </li>
              ))}
            </ol>

            <p className="mt-10 border-t border-[var(--panel-border)] pt-5 text-sm text-muted">
              Staff or admin?{' '}
              <Link
                href="/login"
                className="font-semibold text-[var(--accent)] hover:underline"
              >
                Open the console
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  )
}

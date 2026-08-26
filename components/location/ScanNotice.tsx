import Link from 'next/link'
import { LogoTile } from '@/components/Logo'
import { CalendarX, CircleAlert, MapPinOff, ScanLine, UserRound } from 'lucide-react'

/**
 * The three ways arriving at a check-in code can fail: a kiosk token that has
 * expired, a token signed for a different location, and a code that resolves to
 * no location at all.
 *
 * All three used to render a bare centred sentence in raw `text-red-500` or
 * `text-amber-600` — no header, no branding, and no route forward. The two most
 * confusing ways to arrive were the two least designed screens in the product,
 * and a visitor who hit one had nothing to do next.
 *
 * Status colour is text and icon only, never a fill, per DESIGN.md's
 * Status-Is-Not-Brand rule; the heading itself stays in `foreground` so the
 * page does not read as an alarm.
 */
export function ScanNotice({
  tone,
  icon,
  title,
  detail,
}: {
  tone: 'danger' | 'warning'
  icon: 'expired' | 'mismatch' | 'missing'
  title: string
  detail: string
}) {
  const toneText = tone === 'warning' ? 'text-[var(--status-warning)]' : 'text-[var(--status-danger)]'
  const Icon = icon === 'expired' ? CalendarX : icon === 'mismatch' ? MapPinOff : CircleAlert

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="ambient-wash absolute inset-0" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-[var(--panel-border)]">
          <nav aria-label="Primary" className="shell">
            <div className="mx-auto flex h-16 w-full max-w-[34rem] items-center sm:h-[4.5rem]">
            <Link
              href="/landing"
              aria-label="Kamnotheat — home"
              className="group flex items-center gap-3 rounded-2xl"
            >
              <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
              <span>
                <span className="block text-sm font-semibold tracking-tight">Kamnotheat</span>
                <span className="block text-xs text-muted">Secure check-in logging</span>
              </span>
            </Link>
            </div>
          </nav>
        </header>

        <main id="main" className="shell flex flex-1 items-center py-12">
          <div className="mx-auto w-full max-w-[34rem]">
            <div className="glass shadow-panel rounded-3xl p-6 sm:p-7">
              <Icon className={`size-7 ${toneText}`} strokeWidth={2} aria-hidden />
              <h1 className="mt-4 text-2xl font-extrabold leading-tight tracking-[-0.015em]">
                {title}
              </h1>
              <p className="mt-2 text-pretty text-muted">{detail}</p>

              {/* The same two routes the scanner offers, for the same reason: a
                  physical door already has them, and neither needs an account. */}
              <h2 className="mt-7 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Two other ways in
              </h2>
              <ul className="mt-3 space-y-3">
                <li className="flex items-start gap-3">
                  <ScanLine
                    className="mt-0.5 size-4 shrink-0 text-[var(--accent)]"
                    strokeWidth={2.3}
                  />
                  <p className="text-sm text-muted">
                    <span className="font-semibold text-foreground">Scan the code again.</span>{' '}
                    Point your phone&apos;s camera at the QR posted at your location — a kiosk
                    code refreshes every few seconds.
                  </p>
                </li>
                <li className="flex items-start gap-3">
                  <UserRound
                    className="mt-0.5 size-4 shrink-0 text-[var(--accent)]"
                    strokeWidth={2.3}
                  />
                  <p className="text-sm text-muted">
                    <span className="font-semibold text-foreground">Ask at reception.</span> A
                    host can check you in if the code is damaged, missing, or will not open.
                  </p>
                </li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { LockKeyhole, Server, ShieldCheck } from 'lucide-react'
import { LogoTile } from '@/components/Logo'
import { ParticleField } from '@/components/ParticleField'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

/**
 * The shared frame for /login and /register.
 *
 * Sized to one screen. The frame is a flex column at `min-h-screen-safe`, the
 * header is fixed, and `main` takes the remaining height and centres its content
 * — so nothing has to be computed with `calc()` against a header height that
 * changes at `sm`.
 *
 * Two things previously made these pages scroll when their content already fit:
 * the atmosphere layer was `h-[115vh] min-h-[820px]` (copied from the landing,
 * where the page is long anyway) and an absolutely-positioned child still
 * extends its scroll container, so a 900px viewport got a 1035px page; and the
 * supporting column stacked *above* the card on mobile, where it has no room.
 *
 * It never clips: if the content genuinely cannot fit — a very small phone, 200%
 * zoom, enlarged text — the page scrolls normally rather than hiding anything.
 */

// Rendered from both Server Components (login/register pages) and, via
// ForgotPasswordForm / ResetPasswordPage, from inside a 'use client' subtree —
// whichever imports it first pulls it into that bundle. `useTranslations`
// from the base 'next-intl' package (not the async next-intl/server
// getTranslations) is the one API that works correctly in both: async
// Client Components aren't supported at all, and getTranslations throws when
// it ends up bundled for the client.
export function AuthLayout({
  children,
  headline,
  subhead,
}: {
  children: ReactNode
  /** Display-type tagline for the supporting column. Not the page heading — the
   *  task inside the card is, which is what keeps an <h1> on screen at every
   *  size even though this column is desktop-only. */
  headline: ReactNode
  subhead: string
}) {
  const t = useTranslations('common')

  /** The same three factual anchors the landing uses. No new claims. */
  const anchors = [
    { Icon: ShieldCheck, label: t('factAppendOnly') },
    { Icon: Server, label: t('factMongo') },
    { Icon: LockKeyhole, label: t('factRoleScoped') },
  ]

  return (
    <div className="min-h-screen-safe relative flex flex-col overflow-x-clip bg-background text-foreground">
      {/* Sized to the frame, never beyond it. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="ambient-wash absolute inset-0" />
        <ParticleField className="absolute inset-0" />
      </div>

      <a
        href="#main"
        className="glass sr-only rounded-full px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        {t('skipToContent')}
      </a>

      <header className="relative z-10 shrink-0 border-b border-[var(--panel-border)]">
        <nav aria-label="Primary" className="shell flex h-16 items-center gap-3 sm:h-[4.5rem]">
          <Link
            href="/landing"
            aria-label={t('homeAriaLabel')}
            className="group flex items-center gap-3 rounded-2xl"
          >
            <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
            <span className="hidden sm:block">
              <span className="block text-sm font-bold tracking-tight">Kamnotheat</span>
              <span className="block text-xs text-muted">{t('tagline')}</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </nav>
      </header>

      {/* Padding is tied to viewport height, so a short window tightens instead
          of overflowing. */}
      <main
        id="main"
        className="shell relative z-10 grid flex-1 items-center gap-12 py-[clamp(0.875rem,3vh,4rem)] lg:grid-cols-[minmax(0,1fr)_minmax(0,27rem)] lg:gap-20"
      >
        {/* Desktop-only. On a phone the card is the whole job, and this column
            is what fills width that would otherwise sit empty — stacking it
            above or below the form only pushed the task off screen. */}
        <div className="hidden lg:block">
          <p className="text-balance text-[clamp(1.875rem,3.4vw,2.75rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">
            {headline}
          </p>
          <p className="mt-5 max-w-[52ch] text-pretty text-lg text-muted">{subhead}</p>
          <ul className="mt-8 flex flex-col gap-2.5 text-sm text-muted">
            {anchors.map(({ Icon, label }) => (
              <li key={label} className="inline-flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-[var(--accent)]" strokeWidth={2.4} />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="glass shadow-panel auth-card mx-auto w-full max-w-md rounded-3xl lg:mx-0 lg:max-w-none">
          {children}
        </div>
      </main>
    </div>
  )
}

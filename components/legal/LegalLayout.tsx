import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { ArrowLeft } from 'lucide-react'
import { LogoTile } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'

/**
 * Shared chrome for /privacy and /terms: same minimal header as the landing
 * page and AuthLayout (logo, language, theme — no console nav), a title block,
 * a desktop-only table of contents, and the site footer. Read mode: comprehension
 * outranks expression, so no ParticleField/hero glass here.
 */
export async function LegalLayout({
  title,
  lastUpdated,
  toc,
  children,
}: {
  title: string
  /** Fixed draft date, e.g. "September 26, 2026" — bump by hand when content changes. Never `new Date()`; that would silently misdate every past version as "current". */
  lastUpdated: string
  toc: { id: string; label: string }[]
  children: ReactNode
}) {
  const t = await getTranslations('common')
  const tLegal = await getTranslations('legal')

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="glass sr-only rounded-full px-4 py-2 text-sm font-semibold focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        {t('skipToContent')}
      </a>

      <header className="border-b border-[var(--panel-border)]">
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

      <main id="main" className="shell py-12 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/landing"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-accent"
          >
            <ArrowLeft className="size-4" strokeWidth={2.2} />
            {t('backToHome')}
          </Link>

          <h1 className="mt-6 text-3xl font-extrabold tracking-[-0.02em] sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm text-muted">Last updated {lastUpdated}</p>
          <p className="mt-1 text-sm italic text-muted">{tLegal('englishOnlyNotice')}</p>

          <div className="mt-10 grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label="Table of contents" className="hidden lg:block">
              <ul className="sticky top-8 space-y-2 border-l border-border pl-4 text-sm">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a href={`#${item.id}`} className="text-muted transition-colors hover:text-accent">
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="min-w-0 max-w-[68ch] [&_h2]:mt-12 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-muted [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:text-muted [&_li]:leading-relaxed">
              {children}
            </div>
          </div>
        </div>
      </main>

      <footer className="mt-20 border-t border-[var(--panel-border)]">
        <div className="shell flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted sm:flex-row">
          <p>{t('copyright', { year: new Date().getFullYear() })}</p>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="transition-colors hover:text-accent">
              {t('privacyPolicy')}
            </Link>
            <Link href="/terms" className="transition-colors hover:text-accent">
              {t('termsOfUse')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/**
 * An uninventable fact (legal entity name, contact channel, jurisdiction) —
 * PRODUCT.md's "never fabricate proof" rule extended to legal claims. Amber
 * (Warning/Pending) is the exact right semantic register: this needs someone's
 * attention before the document is real, not decoration.
 */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded border border-dashed border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 italic text-amber-700 dark:text-amber-300">
      {children}
    </span>
  )
}

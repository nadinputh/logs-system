import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { connectDB } from '@/lib/db'
import { Plan } from '@/lib/models/Plan'
import { LogoTile } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { PricingTable, type PricingPlan } from './PricingTable'
import { ArrowRight } from 'lucide-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Pricing — Kamnotheat',
  description: 'Plans for every estate size — from a single building to a multi-site organization.',
}

export default async function PricingPage() {
  const t = await getTranslations('pricing')
  const tCommon = await getTranslations('common')

  await connectDB()
  // isActive:false is exactly how legacy-unlimited (the non-purchasable
  // grandfather plan) is kept out of every plan-picker UI — see scripts/seed-plans.ts.
  const plans = await Plan.find({ isActive: true })
    .select('key name billingCycle priceCents currency trialDays limits')
    .sort({ priceCents: 1 })
    .lean()

  const byKey = new Map<string, { monthly?: PricingPlan; annual?: PricingPlan }>()
  for (const p of plans) {
    const row: PricingPlan = {
      id: String(p._id),
      key: p.key,
      name: p.name,
      billingCycle: p.billingCycle,
      priceCents: p.priceCents,
      currency: p.currency,
      trialDays: p.trialDays,
      limits: p.limits,
    }
    const entry = byKey.get(p.key) ?? {}
    entry[p.billingCycle] = row
    byKey.set(p.key, entry)
  }
  const tiers = [...byKey.values()].filter((t) => t.monthly || t.annual)

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="relative z-10">
        <header className="sticky top-0 z-40 border-b border-[var(--panel-border)] bg-background/70 backdrop-blur-xl">
          <nav className="shell flex h-16 items-center gap-3 sm:h-[4.5rem]">
            <Link href="/landing" aria-label={tCommon('homeAriaLabel')} className="group flex items-center gap-3 rounded-2xl">
              <LogoTile className="size-10 transition-transform group-hover:scale-[1.03]" />
              <span className="hidden sm:block">
                <span className="block text-sm font-bold tracking-tight">Kamnotheat</span>
                <span className="block text-xs text-muted">{tCommon('tagline')}</span>
              </span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
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

        <main className="shell py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-balance text-[clamp(2.25rem,5vw,3.5rem)] font-extrabold leading-[1.05] tracking-[-0.02em]">
              {t('title')}
            </h1>
            <p className="mt-5 text-pretty text-lg text-muted">{t('subtitle')}</p>
          </div>

          <PricingTable plans={tiers} />
        </main>

        <footer className="border-t border-[var(--panel-border)]">
          <div className="shell flex flex-col items-center justify-between gap-5 py-10 sm:flex-row">
            <div className="flex items-center gap-3">
              <LogoTile className="size-9 rounded-xl" />
              <span className="text-sm font-semibold">Kamnotheat</span>
            </div>
            <p className="text-sm text-muted">{tCommon('tagline')}</p>
          </div>
        </footer>
      </div>
    </div>
  )
}

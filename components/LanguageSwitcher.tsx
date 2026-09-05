'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useTransition } from 'react'
import { Languages } from 'lucide-react'
import { Dropdown } from '@heroui/react'
import { locales, localeNames, localeShortNames, type Locale } from '@/i18n/config'
import { setUserLocale } from '@/i18n/locale'

// Cookie-based, not route-based: there is no /en or /km segment, so switching
// locale only needs a cookie write + a data refresh, not a navigation. Calling
// a Server Action from a client component like this always triggers Next.js
// to re-render the current route's Server Components with the new request
// context (the cookie is already set by the time the action resolves), so no
// manual router.refresh() is needed here.
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const locale = useLocale() as Locale
  const t = useTranslations('common')
  const [isPending, startTransition] = useTransition()

  function onChange(next: Locale) {
    if (next === locale) return
    startTransition(() => {
      void setUserLocale(next)
    })
  }

  return (
    <Dropdown>
      <Dropdown.Trigger
        aria-label={`${t('language')}: ${localeNames[locale]}`}
        isDisabled={isPending}
        className={`inline-flex h-11 items-center gap-1 rounded-full border border-border/80 bg-overlay/80 px-2.5 text-sm font-medium text-muted shadow-sm shadow-black/5 outline-none transition-all hover:bg-accent/10 hover:text-accent focus-visible:ring-2 focus-visible:ring-accent/30 data-[hovered]:bg-accent/10 data-[hovered]:text-accent disabled:opacity-60 [&_svg]:text-current ${className}`}
      >
        <Languages className="size-4 shrink-0" strokeWidth={2.2} />
        {/* Short code (EN/KM), not the full localeName — this trigger sits in
            tight chrome (landing header, NavBar) with no room to spare; the
            full name still shows for each option inside the popover. */}
        <span>{localeShortNames[locale]}</span>
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end" className="w-40 rounded-2xl border border-border/70 bg-overlay p-2 shadow-xl shadow-slate-900/10">
        <Dropdown.Menu aria-label={t('language')} className="space-y-1">
          {locales.map((code) => (
            <Dropdown.Item
              key={code}
              id={code}
              textValue={localeNames[code]}
              onAction={() => onChange(code)}
              className={`rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors hover:bg-accent/10 hover:text-accent focus:bg-accent/10 focus:text-accent data-[hovered]:bg-accent/10 data-[hovered]:text-accent ${
                code === locale ? 'bg-accent/10 text-accent' : 'text-foreground'
              }`}
            >
              {localeNames[code]}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}

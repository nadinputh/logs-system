export const locales = ['en', 'km'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  en: 'English',
  km: 'ខ្មែរ',
}

// Trigger-button label, not the dropdown list (which uses localeNames in
// full). A fixed-width Latin code keeps the switcher's footprint predictable
// everywhere it's placed — including the landing header, where it sits
// alongside a full-text CTA with no overflow menu to fall back to.
export const localeShortNames: Record<Locale, string> = {
  en: 'EN',
  km: 'KM',
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

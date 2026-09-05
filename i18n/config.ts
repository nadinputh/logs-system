export const locales = ['en', 'km'] as const

export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = 'en'

export const localeNames: Record<Locale, string> = {
  en: 'English',
  km: 'ខ្មែរ',
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}

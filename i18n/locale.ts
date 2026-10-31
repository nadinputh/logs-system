'use server'

import { cookies, headers } from 'next/headers'
import { defaultLocale, isLocale, type Locale } from './config'

// Plain cookie, not a signed/httpOnly session value: it holds a display
// preference with no security weight, and next-intl's request config (and the
// client language switcher) both need to read it directly.
const COOKIE_NAME = 'NEXT_LOCALE'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Best supported primary language in an Accept-Language header, by q-value. */
function fromAcceptLanguage(header: string | null): Locale | undefined {
  return (header ?? '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=')
      return { lang: tag.split('-')[0].toLowerCase(), q: q === undefined ? 1 : Number(q) || 0 }
    })
    .filter(({ q }) => q > 0)
    .sort((a, b) => b.q - a.q)
    .map(({ lang }) => lang)
    .find(isLocale)
}

// An explicit choice (cookie) wins; a first-time visitor — typically someone who
// just scanned a room QR and will never see a language control twice — gets
// their browser's language rather than English by default.
export async function getUserLocale(): Promise<Locale> {
  const value = (await cookies()).get(COOKIE_NAME)?.value
  if (value && isLocale(value)) return value
  return fromAcceptLanguage((await headers()).get('accept-language')) ?? defaultLocale
}

// A Server Action is a public endpoint: the `Locale` type is compile-time only,
// so the value is re-checked here instead of being written to the cookie as sent.
export async function setUserLocale(locale: string) {
  if (!isLocale(locale)) return
  ;(await cookies()).set(COOKIE_NAME, locale, { maxAge: COOKIE_MAX_AGE, path: '/' })
}

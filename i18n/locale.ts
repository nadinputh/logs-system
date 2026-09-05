'use server'

import { cookies } from 'next/headers'
import { defaultLocale, isLocale, type Locale } from './config'

// Plain cookie, not a signed/httpOnly session value: it holds a display
// preference with no security weight, and next-intl's request config (and the
// client language switcher) both need to read it directly.
const COOKIE_NAME = 'NEXT_LOCALE'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export async function getUserLocale(): Promise<Locale> {
  const value = (await cookies()).get(COOKIE_NAME)?.value
  return value && isLocale(value) ? value : defaultLocale
}

export async function setUserLocale(locale: Locale) {
  (await cookies()).set(COOKIE_NAME, locale, { maxAge: COOKIE_MAX_AGE, path: '/' })
}

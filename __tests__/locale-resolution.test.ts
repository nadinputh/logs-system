import { beforeEach, describe, expect, it, vi } from 'vitest'

const jar = new Map<string, string>()
let acceptLanguage: string | null = null
const set = vi.fn((name: string, value: string) => void jar.set(name, value))

vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (jar.has(n) ? { value: jar.get(n) } : undefined), set }),
  headers: async () => ({ get: () => acceptLanguage }),
}))

import { getUserLocale, setUserLocale } from '@/i18n/locale'

beforeEach(() => {
  jar.clear()
  set.mockClear()
  acceptLanguage = null
})

describe('getUserLocale', () => {
  it('prefers the cookie over the browser language', async () => {
    jar.set('NEXT_LOCALE', 'en')
    acceptLanguage = 'km-KH,km;q=0.9'
    expect(await getUserLocale()).toBe('en')
  })

  it('falls back to the best supported Accept-Language', async () => {
    acceptLanguage = 'fr-FR,km-KH;q=0.8,en;q=0.5'
    expect(await getUserLocale()).toBe('km')
  })

  it('defaults to en when nothing matches or the cookie is junk', async () => {
    jar.set('NEXT_LOCALE', 'zz')
    acceptLanguage = 'fr,de;q=0.4,km;q=0'
    expect(await getUserLocale()).toBe('en')
  })
})

describe('setUserLocale', () => {
  it('writes a supported locale and ignores anything else', async () => {
    await setUserLocale('km')
    await setUserLocale('<script>')
    expect(set).toHaveBeenCalledTimes(1)
    expect(jar.get('NEXT_LOCALE')).toBe('km')
  })
})

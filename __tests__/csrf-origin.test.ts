import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { assertSameOrigin } from '@/lib/csrf'

const APP = 'http://localhost:4242'
const OLD = process.env.NEXTAUTH_URL

beforeAll(() => {
  process.env.NEXTAUTH_URL = APP
})
afterAll(() => {
  process.env.NEXTAUTH_URL = OLD
})

function reqWith(headers: Record<string, string>) {
  return new Request(APP + '/api/something', { method: 'POST', headers })
}

describe('assertSameOrigin — allows same origin, refuses cross-origin', () => {
  it('allows a same-origin POST', () => {
    expect(assertSameOrigin(reqWith({ origin: APP }))).toBeNull()
  })

  it('allows a request with neither Origin nor Referer (curl / server-to-server / tests)', () => {
    expect(assertSameOrigin(reqWith({}))).toBeNull()
  })

  it('falls back to Referer when Origin is absent', () => {
    expect(assertSameOrigin(reqWith({ referer: `${APP}/dashboard` }))).toBeNull()
  })

  it('rejects a cross-origin POST with 403', async () => {
    const res = assertSameOrigin(reqWith({ origin: 'https://evil.example' }))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    const body = await res!.json()
    expect(body.error).toMatch(/cross-origin/i)
  })

  it('rejects a malformed Origin with 400', async () => {
    const res = assertSameOrigin(reqWith({ origin: 'not-a-url' }))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(400)
  })
})

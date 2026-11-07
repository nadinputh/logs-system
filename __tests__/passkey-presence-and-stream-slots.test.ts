import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const SESSION = '11111111-1111-4111-8111-111111111111'
const LOC = 'aaaaaaaaaaaaaaaaaaaaaaa1'

async function challenge(opts: { mode: 'click' | 'passkey'; requireDynamicQr?: boolean; action: 'in' | 'out'; kioskToken?: string }) {
  vi.resetModules()
  const create = vi.fn()
  vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
  vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
  vi.doMock('@/lib/rateLimitGuard', () => ({ limitByIp: async () => null }))
  vi.doMock('@/lib/models/PasskeyCheckInChallenge', () => ({
    PasskeyCheckInChallenge: { deleteMany: vi.fn(), create },
  }))
  vi.doMock('@/lib/locationOwnership', () => ({
    findOwnedLocationByType: async () => ({
      teamId: 't',
      checkInMode: opts.mode,
      requireDynamicQr: opts.requireDynamicQr,
    }),
  }))
  vi.doMock('@simplewebauthn/server', () => ({
    generateAuthenticationOptions: async () => ({ challenge: 'c' }),
  }))
  const { POST } = await import('@/app/api/logs/passkey/challenge/route')
  const res = await POST(
    new NextRequest('http://localhost/api/logs/passkey/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        locationId: LOC,
        locationType: 'room',
        action: opts.action,
        sessionToken: SESSION,
        idempotencyKey: 'k',
        kioskToken: opts.kioskToken,
      }),
    }),
  )
  return { res, create }
}

describe('passkey check-in challenge demands presence at a passkey location', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuses a passkey-mode check-in with no live kiosk token, even without requireDynamicQr', async () => {
    const { res, create } = await challenge({ mode: 'passkey', action: 'in' })
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('KIOSK_TOKEN_REQUIRED')
    expect(create).not.toHaveBeenCalled()
  })

  it('still lets a passkey-mode check-OUT proceed without a token', async () => {
    const { res, create } = await challenge({ mode: 'passkey', action: 'out' })
    expect(res.status).toBe(200)
    expect(create).toHaveBeenCalledOnce()
  })

  it('does not change a click-mode location', async () => {
    const { res } = await challenge({ mode: 'click', action: 'in' })
    expect(res.status).toBe(200)
  })

  it('still honours requireDynamicQr on its own', async () => {
    const { res } = await challenge({ mode: 'click', requireDynamicQr: true, action: 'in' })
    expect(res.status).toBe(403)
  })
})

describe('acquireStreamSlot (shared concurrent-stream cap)', () => {
  it('refuses once the shared limiter is full, and refunds exactly once on release', async () => {
    vi.resetModules()
    const rateLimitShared = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, window: 7 })
      .mockResolvedValueOnce({ ok: false, retryAfter: 30, window: 7 })
    const rateLimitRefund = vi.fn()
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared, rateLimitRefund }))
    const { acquireStreamSlot } = await import('@/lib/realtime/streamSlot')

    const release = await acquireStreamSlot('k', 5, 1000)
    expect(release).toBeTypeOf('function')
    expect(await acquireStreamSlot('k', 5, 1000)).toBeNull()

    release!()
    release!()
    expect(rateLimitRefund).toHaveBeenCalledTimes(1)
    expect(rateLimitRefund).toHaveBeenCalledWith('k', 1000, 7)
  })
})

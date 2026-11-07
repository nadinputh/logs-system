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
  async function load(prevCount: number | null, shared: any[]) {
    vi.resetModules()
    const rateLimitShared = vi.fn()
    for (const v of shared) rateLimitShared.mockResolvedValueOnce(v)
    const rateLimitRefund = vi.fn()
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/RateBucket', () => ({
      RateBucket: {
        findOne: () => ({ lean: async () => (prevCount === null ? null : { count: prevCount }) }),
      },
    }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared, rateLimitRefund }))
    const { acquireStreamSlot } = await import('@/lib/realtime/streamSlot')
    return { acquireStreamSlot, rateLimitShared, rateLimitRefund }
  }

  it('refunds exactly once on release, and gives back a refused attempt', async () => {
    const { acquireStreamSlot, rateLimitRefund } = await load(null, [
      { ok: true, window: 7 },
      { ok: false, retryAfter: 30, window: 7 },
    ])

    const release = await acquireStreamSlot('k', 5, 1000)
    expect(release).toBeTypeOf('function')
    expect(await acquireStreamSlot('k', 5, 1000)).toBeNull()
    expect(rateLimitRefund).toHaveBeenCalledTimes(1) // the refused attempt

    release!()
    release!()
    expect(rateLimitRefund).toHaveBeenCalledTimes(2)
    expect(rateLimitRefund).toHaveBeenLastCalledWith('k', 1000, 7)
  })

  it('counts streams still open from the previous window against the cap', async () => {
    const { acquireStreamSlot, rateLimitShared } = await load(4, [{ ok: true, window: 8 }])
    await acquireStreamSlot('k', 5, 1000)
    expect(rateLimitShared).toHaveBeenCalledWith('k', 1, 1000)
  })

  it('refuses without charging when the previous window already fills the cap', async () => {
    const { acquireStreamSlot, rateLimitShared } = await load(5, [])
    expect(await acquireStreamSlot('k', 5, 1000)).toBeNull()
    expect(rateLimitShared).not.toHaveBeenCalled()
  })
})

describe('visitor passkey registration demands presence at a passkey location', () => {
  async function register(route: 'options' | 'verify', mode: 'click' | 'passkey') {
    vi.resetModules()
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/rateLimitGuard', () => ({ limitByIp: async () => null }))
    vi.doMock('@/lib/locationOwnership', () => ({
      findOwnedLocationByType: async () => ({ teamId: 't', checkInMode: mode }),
    }))
    vi.doMock('@/lib/models/VisitorPasskeyCredential', () => ({
      VisitorPasskeyCredential: { find: () => ({ lean: async () => [] }) },
    }))
    vi.doMock('@/lib/models/VisitorPasskeyChallenge', () => ({
      VisitorPasskeyChallenge: { deleteMany: vi.fn(), create: vi.fn(), findOne: async () => null },
    }))
    vi.doMock('@simplewebauthn/server', () => ({
      generateRegistrationOptions: async () => ({ challenge: 'c' }),
      verifyRegistrationResponse: vi.fn(),
    }))
    const { POST } = await import(`@/app/api/logs/passkey/visitor/register/${route}/route`)
    const base = { locationId: LOC, locationType: 'room', sessionToken: SESSION }
    return POST(
      new NextRequest(`http://localhost/api/logs/passkey/visitor/register/${route}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(route === 'verify' ? { ...base, response: { id: 'x', type: 'public-key', response: {} } } : base),
      }),
    )
  }

  it.each(['options', 'verify'] as const)('refuses %s with no live kiosk token at a passkey-mode location', async (route) => {
    const res = await register(route, 'passkey')
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('KIOSK_TOKEN_REQUIRED')
  })

  it('leaves a click-mode location alone', async () => {
    expect((await register('options', 'click')).status).toBe(200)
  })
})

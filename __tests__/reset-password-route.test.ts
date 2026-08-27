import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = '507f1f77bcf86cd799439012'

function post(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function get(token?: string) {
  const url = token
    ? `http://localhost/api/auth/reset-password?token=${token}`
    : 'http://localhost/api/auth/reset-password'
  return new NextRequest(url, { method: 'GET' })
}

/**
 * Reset must (a) validate before consuming, (b) claim atomically before
 * writing the new password, (c) bump sessionsVersion so a fresh reset ends
 * every existing session for that user.
 */
describe('GET /api/auth/reset-password — validates without consuming', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns 400 when the token is absent', async () => {
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/VerificationToken', () => ({ VerificationToken: {} }))
    vi.doMock('@/lib/models/User', () => ({ User: {} }))
    vi.doMock('@/lib/verification', () => ({ hashToken: (t: string) => 'h:' + t }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))

    const { GET } = await import('@/app/api/auth/reset-password/route')
    expect((await GET(get())).status).toBe(400)
  })

  it('returns 404 with a coded body when the token is stale', async () => {
    const findOne = () => ({
      select: () => ({ lean: () => Promise.resolve(null) }),
    })
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/VerificationToken', () => ({
      VerificationToken: { findOne },
    }))
    vi.doMock('@/lib/models/User', () => ({ User: {} }))
    vi.doMock('@/lib/verification', () => ({ hashToken: (t: string) => 'h:' + t }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))

    const { GET } = await import('@/app/api/auth/reset-password/route')
    const res = await GET(get('deadbeef'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.code).toBe('INVALID_TOKEN')
  })

  it('returns the email and expiry for a valid link, without consuming it', async () => {
    let consumed = false
    const findOne = () => ({
      select: () => ({
        lean: () => Promise.resolve({
          email: 'alice@acme.test',
          expiresAt: new Date('2026-09-03T09:00:00Z'),
        }),
      }),
    })
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/VerificationToken', () => ({
      VerificationToken: {
        findOne,
        findOneAndUpdate: () => { consumed = true; return null },
      },
    }))
    vi.doMock('@/lib/models/User', () => ({ User: {} }))
    vi.doMock('@/lib/verification', () => ({ hashToken: (t: string) => 'h:' + t }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))

    const { GET } = await import('@/app/api/auth/reset-password/route')
    const res = await GET(get('good'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.email).toBe('alice@acme.test')
    expect(consumed).toBe(false)
  })
})

describe('POST /api/auth/reset-password — consumes atomically and bumps sessionsVersion', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function setup(overrides: {
    /** Present = use as-is (including explicit null). Absent = default valid doc. */
    findOne?: unknown | null
    claim?: unknown | null
  } = {}) {
    const updateOne = vi.fn().mockResolvedValue({})
    const bumpSessionsVersion = vi.fn().mockResolvedValue(1)
    const claimValue =
      'claim' in overrides
        ? overrides.claim
        : { _id: 'tok', userId: USER_ID, email: 'a@b.test' }
    const findOneValue =
      'findOne' in overrides
        ? overrides.findOne
        : { _id: 'tok', userId: USER_ID, email: 'a@b.test' }
    const findOneAndUpdate = vi.fn().mockResolvedValue(claimValue)
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/VerificationToken', () => ({
      VerificationToken: {
        findOne: () => Promise.resolve(findOneValue),
        findOneAndUpdate,
      },
    }))
    vi.doMock('@/lib/models/User', () => ({ User: { updateOne } }))
    vi.doMock('@/lib/verification', () => ({ hashToken: (t: string) => 'h:' + t }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/auth', () => ({ bumpSessionsVersion }))

    const { POST } = await import('@/app/api/auth/reset-password/route')
    return { POST, updateOne, findOneAndUpdate, bumpSessionsVersion }
  }

  it('rejects a stale token with a coded body', async () => {
    const { POST } = await setup({ findOne: null })
    const res = await POST(post({ token: 'stale', password: 'correct-horse' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_TOKEN')
  })

  it('refuses a lost race (another submission claimed first)', async () => {
    const { POST } = await setup({ claim: null })
    const res = await POST(post({ token: 'ok', password: 'correct-horse' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/already been used/i)
  })

  it('writes the new password AND bumps sessionsVersion through the helper', async () => {
    const { POST, updateOne, bumpSessionsVersion } = await setup()
    const res = await POST(post({ token: 'ok', password: 'correct-horse' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.email).toBe('a@b.test')

    // Password write is separate from the sessions-version bump: the helper
    // primes the read-through cache with the new value, so the process serving
    // the reset does not carry a stale `sv` for the next minute — a raw $inc
    // on this same route would leave that cache stale.
    const call = updateOne.mock.calls[0]
    expect(call[0]).toEqual({ _id: USER_ID })
    expect(call[1]).toHaveProperty('passwordHash')
    expect(call[1]).not.toHaveProperty('$inc')

    // The whole point of this repair: a reset ends every existing session for
    // the user, not only the one that submitted the form — via the helper.
    expect(bumpSessionsVersion).toHaveBeenCalledWith(USER_ID)
  })
})

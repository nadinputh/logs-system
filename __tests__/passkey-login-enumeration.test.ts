import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = '507f1f77bcf86cd799439011'

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('passkey login does not reveal whether an account exists', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.NEXTAUTH_SECRET = 'test-secret'
  })

  async function options(user: unknown, creds: unknown[]) {
    const challengeCreate = vi.fn().mockResolvedValue({})
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/rateLimit', () => ({ clientKey: () => 'k' }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared: async () => ({ ok: true }) }))
    vi.doMock('@/lib/models/User', () => ({
      User: { findOne: () => ({ lean: async () => user }) },
    }))
    vi.doMock('@/lib/models/PasskeyCredential', () => ({
      PasskeyCredential: { find: () => ({ lean: async () => creds }) },
    }))
    vi.doMock('@/lib/models/WebAuthnChallenge', () => ({
      WebAuthnChallenge: { deleteMany: vi.fn(), create: challengeCreate },
    }))
    const { POST } = await import('@/app/api/auth/passkey/authenticate/options/route')
    return { POST, challengeCreate }
  }

  it('answers 200 with the same shape for unknown, passkey-less and real accounts', async () => {
    const real = { _id: USER_ID }
    const cred = [{ credentialId: 'abc', transports: ['internal'] }]

    const unknown = await options(null, [])
    const r1 = await unknown.POST(post('/x', { email: 'nobody@acme.test' }))
    vi.resetModules()
    const bare = await options(real, [])
    const r2 = await bare.POST(post('/x', { email: 'bare@acme.test' }))
    vi.resetModules()
    const full = await options(real, cred)
    const r3 = await full.POST(post('/x', { email: 'real@acme.test' }))

    const [b1, b2, b3] = await Promise.all([r1.json(), r2.json(), r3.json()])
    for (const [r, b] of [[r1, b1], [r2, b2], [r3, b3]] as const) {
      expect(r.status).toBe(200)
      expect(Object.keys(b).sort()).toEqual(Object.keys(b3).sort())
      expect(b.ceremonyId).toMatch(/^[0-9a-f]{32}$/)
      expect(b).not.toHaveProperty('userId')
      expect(b.allowCredentials.length).toBeGreaterThanOrEqual(1)
      // Every entry has the same keys, `transports` always an array: a missing
      // key (or a lone empty array) would mark a decoy (or a real account).
      for (const c of b.allowCredentials) {
        expect(Array.isArray(c.transports)).toBe(true)
        expect(Object.keys(c).sort()).toEqual(['id', 'transports', 'type'])
      }
    }
    // Every case does the same database write (so timing is uniform); a decoy's
    // is for a user id nobody owns, so it can never verify.
    expect(unknown.challengeCreate).toHaveBeenCalledOnce()
    expect(bare.challengeCreate).toHaveBeenCalledOnce()
    expect(full.challengeCreate).toHaveBeenCalledOnce()
    expect(String(full.challengeCreate.mock.calls[0][0].userId)).toBe(USER_ID)
    expect(String(unknown.challengeCreate.mock.calls[0][0].userId)).not.toBe(USER_ID)
    // Decoy is stable per address, so repeating the request reveals nothing.
    vi.resetModules()
    const again = await options(null, [])
    const b1b = await (await again.POST(post('/x', { email: 'nobody@acme.test' }))).json()
    // The ceremony id is random per request (a repeating one would mark a
    // passkey-less address); the decoy credential ids are what stay stable.
    expect(b1b.ceremonyId).not.toBe(b1.ceremonyId)
    expect(b1b.allowCredentials[0].id).toBe(b1.allowCredentials[0].id)
  })

  async function verify(challenge: unknown, cred: unknown) {
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/rateLimit', () => ({ clientKey: () => 'k' }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared: async () => ({ ok: true }) }))
    vi.doMock('@/lib/models/WebAuthnChallenge', () => ({
      WebAuthnChallenge: { findOneAndDelete: async () => challenge },
    }))
    vi.doMock('@/lib/models/PasskeyCredential', () => ({
      PasskeyCredential: { findOne: async () => cred, updateOne: vi.fn() },
    }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: { create: vi.fn() } }))
    const { POST } = await import('@/app/api/auth/passkey/authenticate/verify/route')
    return POST
  }

  it('returns one identical failure for no challenge, no credential and a malformed id', async () => {
    const body = { response: { id: 'x' }, ceremonyId: 'a'.repeat(32) }
    const noChallenge = await (await verify(null, null))(post('/v', body))
    vi.resetModules()
    const noCred = await (await verify({ challenge: 'c' }, null))(post('/v', body))
    vi.resetModules()
    const badId = await (await verify(null, null))(post('/v', { ...body, ceremonyId: 'not-an-id' }))

    const bodies = await Promise.all([noChallenge, noCred, badId].map((r) => r.json()))
    for (const r of [noChallenge, noCred, badId]) expect(r.status).toBe(400)
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1)
  })
})

describe('passkey login challenge is consumed atomically', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('two simultaneous submissions of one assertion mint only one pre-auth token', async () => {
    let handed = false
    const create = vi.fn()
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/rateLimit', () => ({ clientKey: () => 'k' }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared: async () => ({ ok: true }) }))
    // findOneAndDelete hands the challenge to exactly one caller, like Mongo does.
    vi.doMock('@/lib/models/WebAuthnChallenge', () => ({
      WebAuthnChallenge: {
        findOneAndDelete: async () => {
          if (handed) return null
          handed = true
          return { userId: USER_ID, challenge: 'c' }
        },
      },
    }))
    vi.doMock('@/lib/models/PasskeyCredential', () => ({
      PasskeyCredential: {
        findOne: async () => ({ _id: 'k', credentialId: 'x', publicKey: 'AA', counter: 0, transports: [] }),
        updateOne: vi.fn(),
      },
    }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: { create } }))
    vi.doMock('@/lib/verification', () => ({ hashToken: (t: string) => 'h:' + t }))
    vi.doMock('@simplewebauthn/server', () => ({
      verifyAuthenticationResponse: async () => ({ verified: true, authenticationInfo: { newCounter: 1 } }),
    }))
    const { POST } = await import('@/app/api/auth/passkey/authenticate/verify/route')
    const body = { response: { id: 'x' }, ceremonyId: 'a'.repeat(32) }
    const [a, b] = await Promise.all([POST(post('/v', body)), POST(post('/v', body))])
    expect([a.status, b.status].sort()).toEqual([200, 400])
    expect(create).toHaveBeenCalledTimes(1)
  })
})

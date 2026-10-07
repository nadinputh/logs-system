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
      expect(b.userId).toMatch(/^[0-9a-f]{24}$/)
      expect(b.allowCredentials).toHaveLength(1)
    }
    // Decoys store no challenge, so they can never verify.
    expect(unknown.challengeCreate).not.toHaveBeenCalled()
    expect(bare.challengeCreate).not.toHaveBeenCalled()
    expect(full.challengeCreate).toHaveBeenCalledOnce()
    // Decoy is stable per address, so repeating the request reveals nothing.
    vi.resetModules()
    const again = await options(null, [])
    const b1b = await (await again.POST(post('/x', { email: 'nobody@acme.test' }))).json()
    expect(b1b.userId).toBe(b1.userId)
    expect(b1b.allowCredentials[0].id).toBe(b1.allowCredentials[0].id)
  })

  async function verify(challenge: unknown, cred: unknown) {
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/rateLimit', () => ({ clientKey: () => 'k' }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared: async () => ({ ok: true }) }))
    vi.doMock('@/lib/models/WebAuthnChallenge', () => ({
      WebAuthnChallenge: { findOne: async () => challenge, deleteOne: vi.fn() },
    }))
    vi.doMock('@/lib/models/PasskeyCredential', () => ({
      PasskeyCredential: { findOne: async () => cred, updateOne: vi.fn() },
    }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: { create: vi.fn() } }))
    const { POST } = await import('@/app/api/auth/passkey/authenticate/verify/route')
    return POST
  }

  it('returns one identical failure for no challenge, no credential and a malformed id', async () => {
    const body = { response: { id: 'x' }, userId: USER_ID }
    const noChallenge = await (await verify(null, null))(post('/v', body))
    vi.resetModules()
    const noCred = await (await verify({ challenge: 'c' }, null))(post('/v', body))
    vi.resetModules()
    const badId = await (await verify(null, null))(post('/v', { ...body, userId: 'not-an-id' }))

    const bodies = await Promise.all([noChallenge, noCred, badId].map((r) => r.json()))
    for (const r of [noChallenge, noCred, badId]) expect(r.status).toBe(400)
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1)
  })
})

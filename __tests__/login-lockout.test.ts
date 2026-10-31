import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Limiter keys carry a hash of the address, never the address itself.
const H = (e: string) => createHash('sha256').update(e).digest('hex').slice(0, 32)

// A stranger spamming an address from their own IP must not be able to lock
// the real owner out.
describe('credentials login rate limiting', () => {
  const calls: string[] = []

  beforeEach(() => {
    vi.resetModules()
    calls.length = 0
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/User', () => ({ User: { findOne: async () => null } }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: {} }))
    vi.doMock('@/lib/models/SessionInventory', () => ({ SessionInventory: {} }))
    vi.doMock('@/lib/rateLimitShared', () => ({
      rateLimitShared: async (key: string) => {
        calls.push(key)
        // The attacker (6.6.6.6) has burned their own (email, ip) bucket.
        return key.startsWith(`login:ei:${H('victim@acme.test')}:6.6.6.6`)
          ? { ok: false, retryAfter: 60 }
          : { ok: true }
      },
    }))
  })

  async function attempt(ip: string) {
    const { authOptions } = await import('@/lib/auth')
    const provider: any = authOptions.providers[0]
    return provider.options.authorize(
      { email: 'victim@acme.test', password: 'whatever-1' },
      { headers: { 'x-forwarded-for': ip } },
    )
  }

  it("locks the guesser's own (email, IP) bucket out", async () => {
    await expect(attempt('6.6.6.6')).rejects.toThrow('TOO_MANY_ATTEMPTS')
  })

  it("does not let that spend the owner's allowance from another IP", async () => {
    await expect(attempt('203.0.113.7')).resolves.toBeNull()
    expect(calls).toContain(`login:ei:${H('victim@acme.test')}:203.0.113.7`)
    expect(calls).toContain(`login:email:${H('victim@acme.test')}`)
  })
})

// Naming "no password set" before the password check told anyone which
// addresses are provisioned accounts. It must look like any other bad login.
describe('credentials login for a passwordless account', () => {
  it('returns null exactly like a wrong password instead of a named error', async () => {
    vi.resetModules()
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/User', () => ({
      User: { findOne: async () => ({ _id: 'u', email: 'p@acme.test', passwordHash: undefined, emailVerified: null }) },
    }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: {} }))
    vi.doMock('@/lib/models/SessionInventory', () => ({ SessionInventory: {} }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared: async () => ({ ok: true }) }))
    const { authOptions } = await import('@/lib/auth')
    const provider: any = authOptions.providers[0]
    await expect(
      provider.options.authorize(
        { email: 'p@acme.test', password: 'whatever-1' },
        { headers: { 'x-forwarded-for': '203.0.113.7' } },
      ),
    ).resolves.toBeNull()
  })
})

// The email becomes limiter keys written on every attempt, so an oversized one
// must be refused before any key is built.
describe('credentials login input bounds', () => {
  it('rejects an oversized email without touching the limiter', async () => {
    vi.resetModules()
    const limiter = vi.fn(async () => ({ ok: true }))
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/User', () => ({ User: { findOne: async () => null } }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: {} }))
    vi.doMock('@/lib/models/SessionInventory', () => ({ SessionInventory: {} }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared: limiter }))
    const { authOptions } = await import('@/lib/auth')
    const provider: any = authOptions.providers[0]
    await expect(
      provider.options.authorize(
        { email: 'a'.repeat(5000) + '@acme.test', password: 'whatever-1' },
        { headers: { 'x-forwarded-for': '203.0.113.7' } },
      ),
    ).resolves.toBeNull()
    expect(limiter).not.toHaveBeenCalled()
  })
})

// A throttled source must not keep minting limiter rows: once the per-IP bucket
// is over its limit, login stops before the email-keyed buckets are touched.
describe('credentials login once the IP is throttled', () => {
  it('does not write the email-keyed buckets', async () => {
    vi.resetModules()
    const keys: string[] = []
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/User', () => ({ User: { findOne: async () => null } }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: {} }))
    vi.doMock('@/lib/models/SessionInventory', () => ({ SessionInventory: {} }))
    vi.doMock('@/lib/rateLimitShared', () => ({
      rateLimitShared: async (k: string) => {
        keys.push(k)
        return k.startsWith('login:ip:') ? { ok: false, retryAfter: 30 } : { ok: true }
      },
    }))
    const { authOptions } = await import('@/lib/auth')
    const provider: any = authOptions.providers[0]
    await expect(
      provider.options.authorize(
        { email: 'victim@acme.test', password: 'whatever-1' },
        { headers: { 'x-forwarded-for': '6.6.6.6' } },
      ),
    ).rejects.toThrow('TOO_MANY_ATTEMPTS')
    expect(keys).toEqual(['login:ip:6.6.6.6'])
  })
})

// The per-IP budget is charged atomically at entry and refunded when the password
// was right, so a concurrent burst cannot slip past a read-then-write check and
// successful sign-ins from a shared address do not consume it.
describe('per-IP login budget counts failures only', () => {
  async function run(userDoc: any, compareOk: boolean) {
    vi.resetModules()
    const calls: string[] = []
    const refunds: string[] = []
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/User', () => ({ User: { findOne: async () => userDoc } }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: {} }))
    vi.doMock('@/lib/models/SessionInventory', () => ({ SessionInventory: { create: vi.fn() } }))
    vi.doMock('bcryptjs', () => ({ default: { compare: async () => compareOk } }))
    vi.doMock('@/lib/rateLimitShared', () => ({
      rateLimitShared: async (key: string) => {
        calls.push(key)
        return { ok: true }
      },
      rateLimitRefund: async (key: string) => {
        refunds.push(key)
      },
    }))
    const { authOptions } = await import('@/lib/auth')
    const provider: any = authOptions.providers[0]
    const out = await provider.options.authorize(
      { email: 'a@acme.test', password: 'pw-123456' },
      { headers: { 'x-forwarded-for': '203.0.113.7' } },
    )
    return { out, calls, refunds }
  }

  it('charges the IP bucket once up front and refunds it on a successful sign-in', async () => {
    const { out, calls, refunds } = await run(
      { _id: { toString: () => 'u1' }, name: 'A', email: 'a@acme.test', role: 'staff', passwordHash: 'h', emailVerified: new Date(), sessionsVersion: 0 },
      true,
    )
    expect(out).toBeTruthy()
    expect(calls.filter((k) => k.startsWith('login:ip:'))).toHaveLength(1)
    expect(refunds).toEqual(['login:ip:203.0.113.7'])
  })

  it('keeps the charge (no refund) when the password is wrong', async () => {
    const { out, refunds } = await run({ _id: 'u1', passwordHash: 'h', emailVerified: new Date() }, false)
    expect(out).toBeNull()
    expect(refunds).toEqual([])
  })

  it('stops at the first refused bucket without touching the per-email ceiling', async () => {
    vi.resetModules()
    const keys: string[] = []
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/User', () => ({ User: { findOne: async () => null } }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: {} }))
    vi.doMock('@/lib/models/SessionInventory', () => ({ SessionInventory: {} }))
    vi.doMock('@/lib/rateLimitShared', () => ({
      rateLimitShared: async (k: string) => {
        keys.push(k)
        return k.startsWith('login:ei:') ? { ok: false, retryAfter: 9 } : { ok: true }
      },
      rateLimitRefund: async () => {},
    }))
    const { authOptions } = await import('@/lib/auth')
    const provider: any = authOptions.providers[0]
    await expect(
      provider.options.authorize(
        { email: 'a@acme.test', password: 'x' },
        { headers: { 'x-forwarded-for': '6.6.6.6' } },
      ),
    ).rejects.toThrow('TOO_MANY_ATTEMPTS')
    expect(keys.some((k) => k.startsWith('login:email:'))).toBe(false)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

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
        return key.startsWith('login:ei:victim@acme.test:6.6.6.6')
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
    expect(calls).toContain('login:ei:victim@acme.test:203.0.113.7')
    expect(calls).toContain('login:email:victim@acme.test')
  })
})

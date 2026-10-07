import { beforeEach, describe, expect, it, vi } from 'vitest'

// A revoked token must be rejected on the FIRST request an instance sees it,
// not after a background refresh lands.
describe('jwt callback — revocation on a cold or expired cache', () => {
  let dbSv: number
  let dbHasJti: boolean
  const findById = vi.fn()
  const exists = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    findById.mockReset()
    exists.mockReset()
    delete (global as any)._svCache
    delete (global as any)._svCachePending
    delete (global as any)._jtiCache
    delete (global as any)._jtiCachePending
    delete (global as any)._jtiLastTouch
    dbSv = 1
    dbHasJti = true
    findById.mockImplementation(() => ({
      select: () => ({ lean: async () => ({ sessionsVersion: dbSv }) }),
    }))
    exists.mockImplementation(async () => (dbHasJti ? { _id: 'r' } : null))
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('@/lib/models/User', () => ({ User: { findById } }))
    vi.doMock('@/lib/models/PreAuthToken', () => ({ PreAuthToken: {} }))
    vi.doMock('@/lib/models/SessionInventory', () => ({
      SessionInventory: { exists, updateOne: vi.fn().mockResolvedValue({}) },
    }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared: async () => ({ ok: true }) }))
  })

  async function jwt(token: Record<string, unknown>) {
    const { authOptions } = await import('@/lib/auth')
    return (authOptions.callbacks!.jwt as any)({ token })
  }

  it('rejects a token with a stale sessionsVersion on a cold cache', async () => {
    dbSv = 2 // bumped elsewhere (password reset / sign out everywhere)
    expect(await jwt({ id: 'u1', sv: 1, sid: 's1' })).toEqual({})
  })

  it('rejects a token whose inventory row was revoked on a cold cache', async () => {
    dbHasJti = false
    expect(await jwt({ id: 'u1', sv: 1, sid: 's1' })).toEqual({})
  })

  it('accepts a live token and then serves the next request from cache', async () => {
    const t = { id: 'u1', sv: 1, sid: 's1' }
    expect(await jwt({ ...t })).toMatchObject(t)
    expect(await jwt({ ...t })).toMatchObject(t)
    expect(findById).toHaveBeenCalledTimes(1)
    expect(exists).toHaveBeenCalledTimes(1)
  })

  it('does not trust an expired entry: re-reads the database before answering', async () => {
    const t = { id: 'u1', sv: 1, sid: 's1' }
    expect(await jwt({ ...t })).toMatchObject(t)
    // Revoked after the entry was cached, then the entry expires.
    dbSv = 2
    for (const e of (global as any)._svCache.values()) e.expiresAt = Date.now() - 1
    expect(await jwt({ ...t })).toEqual({})
  })
  it('session callback returns an empty session for a revoked (empty) token', async () => {
    const { authOptions } = await import('@/lib/auth')
    const cb = authOptions.callbacks!.session as any
    const seeded = { user: { name: 'A', email: 'a@b.co' }, expires: 'x' }
    expect(await cb({ session: seeded, token: {} })).toEqual({})
    const live = await cb({ session: seeded, token: { id: 'u1', role: 'staff' } })
    expect(live.user.id).toBe('u1')
  })
})

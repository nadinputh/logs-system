import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'

// The global setup stubs rateLimitGuard; this test exercises the real thing.
vi.unmock('@/lib/rateLimitGuard')

describe('actorMailLimit — a fresh account is a weak mail relay', () => {
  beforeEach(() => vi.resetModules())

  async function limitFor(actorId: string) {
    const calls: Array<[string, number]> = []
    vi.doMock('@/lib/rateLimitShared', () => ({
      rateLimitShared: async (key: string, limit: number) => {
        calls.push([key, limit])
        return { ok: true }
      },
    }))
    const { actorMailLimit } = await vi.importActual<typeof import('@/lib/rateLimitGuard')>('@/lib/rateLimitGuard')
    await actorMailLimit(actorId, '203.0.113.7')
    return calls
  }

  it('gives an account under a day old 5 mails an hour, an older one 30, and always caps the source', async () => {
    const fresh = new Types.ObjectId().toString()
    const old = Types.ObjectId.createFromTime(Math.floor(Date.now() / 1000) - 3 * 86400).toString()

    const a = await limitFor(fresh)
    expect(a).toContainEqual([`mail-actor:${fresh}`, 5])
    expect(a).toContainEqual(['mail-actor-ip:203.0.113.7', 60])

    vi.resetModules()
    const b = await limitFor(old)
    expect(b).toContainEqual([`mail-actor:${old}`, 30])
  })
})

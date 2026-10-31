import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const TEAM = '507f1f77bcf86cd799439011'
const LOC = '507f1f77bcf86cd799439012'
const SESSION = '550e8400-e29b-41d4-a716-446655440000'

function post(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/quests/[token]/progress — proof of presence', () => {
  beforeEach(() => vi.resetModules())

  async function setup(location: Record<string, unknown>) {
    // The step is now one atomic findOneAndUpdate (no read-modify-write save).
    const save = vi.fn()
    class FakeProgress {
      static findOne = vi.fn().mockResolvedValue(null)
      static findOneAndUpdate = save.mockResolvedValue({
        _id: 'p1',
        completedSteps: [{ stepOrder: 0 }],
        completedAt: undefined,
      })
    }
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/rateLimit', () => ({ clientKey: () => 'k' }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared: async () => ({ ok: true }) }))
    vi.doMock('next-auth', () => ({ getServerSession: async () => null }))
    vi.doMock('@/lib/auth', () => ({ authOptions: {} }))
    vi.doMock('@/lib/models/QuestCard', () => ({
      QuestCard: {
        findOne: async () => ({
          _id: 'c1',
          teamId: TEAM,
          type: 'custom',
          steps: [{ order: 0, locationId: LOC, locationType: 'room' }],
        }),
      },
    }))
    vi.doMock('@/lib/models/QuestProgress', () => ({ QuestProgress: FakeProgress }))
    vi.doMock('@/lib/locationOwnership', () => ({
      findOwnedLocationByType: async () => ({ teamId: TEAM, ...location }),
    }))
    const { POST } = await import('@/app/api/quests/[token]/progress/route')
    const call = (extra: object = {}) =>
      POST(post('/api/quests/t/progress', { locationId: LOC, locationType: 'room', sessionToken: SESSION, ...extra }), {
        params: Promise.resolve({ token: 't' }),
      })
    return { call, save }
  }

  it('refuses a step at a live-QR location when no kiosk token is sent', async () => {
    const { call, save } = await setup({ requireDynamicQr: true })
    const res = await call()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('KIOSK_TOKEN_REQUIRED')
    expect(save).not.toHaveBeenCalled()
  })

  it('still records a step at an ordinary location', async () => {
    const { call, save } = await setup({})
    const res = await call()
    expect(res.status).toBe(200)
    // Atomic: the filter refuses a step that is already recorded (so concurrent
    // requests cannot both push it), then the card is stamped complete.
    expect(save.mock.calls[0][0]).toMatchObject({ 'completedSteps.stepOrder': { $ne: 0 } })
    expect(save.mock.calls[0][1]).toHaveProperty('$push')
    expect(save).toHaveBeenCalledTimes(2)
  })
})

describe('session tokens no longer travel in query strings', () => {
  beforeEach(() => vi.resetModules())

  it('logs/open and visitor/exists are POST-only', async () => {
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/models/Log', () => ({ Log: {} }))
    vi.doMock('@/lib/models/VisitorPasskeyCredential', () => ({ VisitorPasskeyCredential: {} }))
    vi.doMock('@/lib/locationOwnership', () => ({
      findOwnedLocationById: async () => null,
      findOwnedLocationByType: async () => null,
    }))
    const open = await import('@/app/api/logs/open/route')
    const exists = await import('@/app/api/logs/passkey/visitor/exists/route')
    expect((open as any).GET).toBeUndefined()
    expect((exists as any).GET).toBeUndefined()

    // A non-UUID token is rejected before touching the database.
    const bad = await open.POST(post('/api/logs/open', { locationId: LOC, sessionToken: 'nope' }))
    expect(bad.status).toBe(400)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const SESSION = '550e8400-e29b-41d4-a716-446655440000'
const LOC = '507f1f77bcf86cd799439012'
const TEAM = '507f1f77bcf86cd799439011'
const clientData = (challenge: string) =>
  Buffer.from(JSON.stringify({ challenge })).toString('base64url')

describe('POST /api/logs/passkey/verify — cached responses need a verified assertion', () => {
  beforeEach(() => vi.resetModules())

  async function run(verified: boolean) {
    const cachedBody = { verified: true, log: { _id: 'bbbbbbbbbbbbbbbbbbbbbbb1', visitorName: 'Secret Visitor' } }
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/models/Log', () => ({ Log: { findOne: () => ({ select: () => ({ lean: async () => null }) }), create: vi.fn() } }))
    vi.doMock('@/lib/models/PasskeyCredential', () => ({
      PasskeyCredential: { findOne: async () => ({ _id: 'c', userId: 'u1', credentialId: 'cred', publicKey: 'AA', counter: 0, transports: [] }), updateOne: vi.fn() },
    }))
    vi.doMock('@/lib/models/TeamMember', () => ({ TeamMember: { exists: async () => ({ _id: 'm' }) } }))
    vi.doMock('@/lib/models/VisitorPasskeyCredential', () => ({ VisitorPasskeyCredential: {} }))
    vi.doMock('@/lib/models/PasskeyCheckInChallenge', () => ({
      PasskeyCheckInChallenge: {
        findOneAndDelete: async () => ({
          _id: 'i', challenge: 'chal', teamId: TEAM, locationId: LOC, locationType: 'room',
          action: 'in', sessionToken: SESSION, idempotencyKey: 'k1',
        }),
        deleteOne: vi.fn(),
      },
    }))
    vi.doMock('@/lib/idempotency', () => ({ checkIdempotency: async () => ({ statusCode: 201, body: cachedBody }), saveIdempotency: vi.fn() }))
    vi.doMock('@/lib/realtime/logEvents', () => ({ publishLogCreated: vi.fn() }))
    vi.doMock('@/lib/locationOwnership', () => ({ findOwnedLocationByType: async () => null }))
    vi.doMock('@/lib/geofence', () => ({ resolveBuildingId: () => null, computeGeofenceStatus: async () => undefined }))
    vi.doMock('@/lib/checkInLock', () => ({ acquireCheckInLock: async () => async () => {} }))
    vi.doMock('@simplewebauthn/server', () => ({
      verifyAuthenticationResponse: async () => {
        if (!verified) throw new Error('bad signature')
        return { verified: true, authenticationInfo: { newCounter: 1 } }
      },
    }))
    const { POST } = await import('@/app/api/logs/passkey/verify/route')
    const res = await POST(
      new NextRequest('http://localhost/api/logs/passkey/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          response: { id: 'cred', response: { clientDataJSON: clientData('chal') } },
          locationId: LOC, locationType: 'room', action: 'in', sessionToken: SESSION, idempotencyKey: 'k1',
        }),
      }),
    )
    return { res, text: await res.text() }
  }

  it('does NOT hand back the cached response when the assertion fails', async () => {
    const { res, text } = await run(false)
    expect(res.status).toBe(400)
    expect(text).not.toContain('Secret Visitor')
  })

  it('replays it once the assertion verifies', async () => {
    const { res, text } = await run(true)
    expect(res.status).toBe(201)
    expect(text).toContain('Secret Visitor')
  })
})

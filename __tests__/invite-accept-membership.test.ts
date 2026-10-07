import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const TEAM = '507f1f77bcf86cd799439011'
const USER = '507f1f77bcf86cd799439012'

describe('POST /api/teams/invites/[token]/accept — existing membership', () => {
  beforeEach(() => vi.resetModules())

  async function accept(existing: { status: string; role: string } | null) {
    const create = vi.fn().mockResolvedValue({})
    const invite: any = { teamId: TEAM, email: 'a@acme.test', role: 'admin', status: 'pending', save: vi.fn() }
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/verification', () => ({ hashToken: (t: string) => t }))
    vi.doMock('@/lib/models/TeamInvite', () => ({ TeamInvite: { findOne: async () => invite } }))
    vi.doMock('@/lib/models/User', () => ({
      User: {
        findById: () => ({ select: () => ({ lean: async () => ({ activeTeamId: TEAM }) }) }),
        updateOne: vi.fn(),
      },
    }))
    vi.doMock('@/lib/models/TeamMember', () => ({
      TeamMember: {
        findOne: () => ({ select: () => ({ lean: async () => existing }) }),
        create,
      },
    }))
    vi.doMock('@/lib/middleware/auth', () => ({
      requireAuth: async () => ({ error: null, session: { user: { id: USER, email: 'a@acme.test' } } }),
    }))
    const { POST } = await import('@/app/api/teams/invites/[token]/accept/route')
    const res = await POST(new NextRequest('http://localhost/x', { method: 'POST' }), {
      params: Promise.resolve({ token: 't' }),
    })
    return { res, create, invite }
  }

  it('creates the membership for a new member', async () => {
    const { res, create } = await accept(null)
    expect(res.status).toBe(200)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin', status: 'active' }))
  })

  it('does not reactivate a suspended member', async () => {
    const { res, create, invite } = await accept({ status: 'suspended', role: 'member' })
    expect(res.status).toBe(403)
    expect(create).not.toHaveBeenCalled()
    expect(invite.save).not.toHaveBeenCalled()
  })

  it("leaves an active member's role alone", async () => {
    const { res, create } = await accept({ status: 'active', role: 'owner' })
    expect(res.status).toBe(200)
    expect(create).not.toHaveBeenCalled()
    expect((await res.json()).role).toBe('owner')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const TEAM_ID = '507f1f77bcf86cd799439011'
const ACTOR_USER_ID = '507f1f77bcf86cd799439012'
const NEW_USER_ID = '507f1f77bcf86cd799439013'

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** A mongoose-ish chainable that resolves to `value` at .lean(). */
function chain(value: unknown) {
  const q: any = { select: vi.fn(), lean: vi.fn() }
  q.select.mockReturnValue(q)
  q.lean.mockResolvedValue(value)
  return q
}

/**
 * The account, its membership and its token are all committed before the mail
 * is attempted. Letting the send throw returned a 500 for a user that now
 * existed — and the admin's retry hit the duplicate-email guard and was told to
 * invite them instead, which 409s too. These tests pin the contract that closed
 * that trap.
 */
describe('POST /api/admin/users — mail is best-effort, never load-bearing', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function setup(sendImpl: () => Promise<boolean>) {
    const requireTeamPermission = vi.fn().mockResolvedValue({
      error: null,
      teamId: TEAM_ID,
      session: { user: { id: ACTOR_USER_ID, name: 'Priya Raman' } },
      membership: { role: 'owner' },
    })
    const userFindOne = vi.fn().mockReturnValue(chain(null)) // no duplicate
    const userCreate = vi.fn().mockResolvedValue({
      _id: { toString: () => NEW_USER_ID },
      name: 'Jane Doe',
      email: 'jane@acme.test',
    })
    const teamMemberCreate = vi.fn().mockResolvedValue({})
    const teamFindById = vi.fn().mockReturnValue(chain({ name: 'Acme HQ' }))
    const issueVerificationToken = vi.fn().mockResolvedValue({
      token: 'plaintext-token',
      expiresAt: new Date('2026-09-03T09:00:00Z'),
    })
    const sendSetPasswordEmail = vi.fn().mockImplementation(sendImpl)

    vi.doMock('@/lib/middleware/auth', () => ({ requireTeamPermission }))
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('@/lib/models/User', () => ({ User: { findOne: userFindOne, create: userCreate } }))
    vi.doMock('@/lib/models/TeamMember', () => ({ TeamMember: { create: teamMemberCreate } }))
    vi.doMock('@/lib/models/Team', () => ({ Team: { findById: teamFindById } }))
    vi.doMock('@/lib/verification', () => ({
      issueVerificationToken,
      setPasswordLink: (t: string) => `https://kamnotheat.example/set-password/${t}`,
    }))
    vi.doMock('@/lib/email/send', () => ({ sendSetPasswordEmail }))

    const { POST } = await import('@/app/api/admin/users/route')
    return { POST, userCreate, teamMemberCreate, sendSetPasswordEmail }
  }

  const BODY = { name: 'Jane Doe', email: 'jane@acme.test', role: 'member' }

  it('still returns 201 when the mail transport throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { POST, userCreate, teamMemberCreate } = await setup(async () => {
      throw new Error("SMTP transport unavailable — the 'nodemailer' package is not installed.")
    })

    const res = await POST(makeReq(BODY))

    // The account was created; refusing to admit that is what stranded admins.
    expect(res!.status).toBe(201)
    expect(userCreate).toHaveBeenCalledOnce()
    expect(teamMemberCreate).toHaveBeenCalledOnce()
    expect(err).toHaveBeenCalled()

    const body = await res!.json()
    expect(body.emailDelivered).toBe(false)
    // The recovery: without this the admin has no lever at all.
    expect(body.setPasswordUrl).toContain('/set-password/plaintext-token')
  })

  it('reports emailDelivered:false when SMTP is unconfigured and nothing was sent', async () => {
    const { POST } = await setup(async () => false)
    const res = await POST(makeReq(BODY))
    const body = await res!.json()

    expect(res!.status).toBe(201)
    // The old client asserted "a set-password email was sent" on exactly this
    // path, where nothing left the process.
    expect(body.emailDelivered).toBe(false)
    expect(body.setPasswordUrl).toBeTruthy()
  })

  it('reports emailDelivered:true only on a real send', async () => {
    const { POST, sendSetPasswordEmail } = await setup(async () => true)
    const res = await POST(makeReq(BODY))
    const body = await res!.json()

    expect(body.emailDelivered).toBe(true)
    // The actor and expiry are the facts the message was discarding.
    expect(sendSetPasswordEmail).toHaveBeenCalledWith(
      'jane@acme.test',
      expect.stringContaining('/set-password/'),
      expect.objectContaining({ teamName: 'Acme HQ', invitedByName: 'Priya Raman' }),
    )
    expect(sendSetPasswordEmail.mock.calls[0][2].expiresAt).toBeInstanceOf(Date)
  })
})

/**
 * Register creates the account regardless, so its confirmation copy is a claim,
 * not a hedge. It told every registrant "a verification link is on its way"
 * even when nothing left the process — and then offered "try a different
 * address", which orphans a second account for a server-side problem.
 */
describe('POST /api/auth/register — reports whether the mail actually went out', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function setup(sendImpl: () => Promise<boolean>) {
    const chainNull = () => {
      const q: any = { select: vi.fn(), lean: vi.fn() }
      q.select.mockReturnValue(q)
      q.lean.mockResolvedValue(null)
      return q
    }
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('@/lib/models/User', () => ({
      User: {
        findOne: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ _id: { toString: () => NEW_USER_ID } }),
        updateOne: vi.fn().mockResolvedValue({}),
      },
    }))
    vi.doMock('@/lib/models/Team', () => ({
      Team: {
        findOne: vi.fn().mockReturnValue(chainNull()),
        create: vi.fn().mockResolvedValue({ _id: { toString: () => TEAM_ID } }),
      },
    }))
    vi.doMock('@/lib/models/TeamMember', () => ({ TeamMember: { create: vi.fn().mockResolvedValue({}) } }))
    vi.doMock('@/lib/verification', () => ({
      issueVerificationToken: vi.fn().mockResolvedValue({ token: 'tok', expiresAt: new Date() }),
      verifyEmailLink: (t: string) => `https://kamnotheat.example/verify/${t}`,
    }))
    vi.doMock('@/lib/email/send', () => ({ sendVerificationEmail: vi.fn().mockImplementation(sendImpl) }))
    vi.doMock('@/lib/rateLimit', () => ({ rateLimit: () => ({ ok: true, retryAfter: 0 }), clientKey: () => 'k' }))

    const { POST } = await import('@/app/api/auth/register/route')
    return { POST }
  }

  function req() {
    return new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
      body: JSON.stringify({
        name: 'Jane Doe',
        email: 'jane@acme.test',
        password: 'correct-horse',
        teamName: 'Acme HQ',
      }),
    })
  }

  it('says the link is on its way only when it actually is', async () => {
    const { POST } = await setup(async () => true)
    const body = await (await POST(req())).json()
    expect(body.delivered).toBe(true)
    expect(body.message).toContain('Check your email')
  })

  it('does not claim a delivery when nothing was sent', async () => {
    const { POST } = await setup(async () => false)
    const res = await POST(req())
    const body = await res.json()

    // The account exists either way — that part must not change.
    expect(res.status).toBe(201)
    expect(body.ok).toBe(true)
    expect(body.delivered).toBe(false)
    expect(body.message).not.toContain('Check your email')
    expect(body.message).toContain('could not be sent')
  })

  it('reports undelivered rather than 500 when the transport throws', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { POST } = await setup(async () => {
      throw new Error('SMTP transport unavailable')
    })
    const res = await POST(req())
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.delivered).toBe(false)
    expect(err).toHaveBeenCalled()
  })
})

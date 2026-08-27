import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = '507f1f77bcf86cd799439012'

function makeReq(email: string) {
  return new NextRequest('http://localhost/api/auth/resend-verification', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
    body: JSON.stringify({ email }),
  })
}

/**
 * An admin-provisioned account has no password. Issuing an email_verify token
 * for it marked the address verified and left the account still unreachable —
 * the only recovery button the user could see appeared to work while moving
 * them further from access. Every other exit was sealed: sign-in fails without a
 * passwordHash, there is no forgot-password route, and both re-creating and
 * inviting the user 409.
 */
describe('POST /api/auth/resend-verification — reissues the token type that opens the account', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function setup(user: Record<string, unknown> | null) {
    const issueVerificationToken = vi.fn().mockResolvedValue({
      token: 'tok',
      expiresAt: new Date('2026-09-03T09:00:00Z'),
    })
    const sendVerificationEmail = vi.fn().mockResolvedValue(true)
    const sendSetPasswordEmail = vi.fn().mockResolvedValue(true)

    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('@/lib/models/User', () => ({
      User: { findOne: vi.fn().mockResolvedValue(user) },
    }))
    vi.doMock('@/lib/verification', () => ({
      issueVerificationToken,
      verifyEmailLink: (t: string) => `https://kamnotheat.example/verify/${t}`,
      setPasswordLink: (t: string) => `https://kamnotheat.example/set-password/${t}`,
    }))
    vi.doMock('@/lib/email/send', () => ({
      sendVerificationEmail,
      sendSetPasswordEmail,
      smtpConfigured: () => true,
    }))
    vi.doMock('@/lib/rateLimit', () => ({
      rateLimit: () => ({ ok: true, retryAfter: 0 }),
      clientKey: () => 'k',
    }))

    const { POST } = await import('@/app/api/auth/resend-verification/route')
    return { POST, issueVerificationToken, sendVerificationEmail, sendSetPasswordEmail }
  }

  it('sends a set-password link when the account has no password', async () => {
    const { POST, issueVerificationToken, sendSetPasswordEmail, sendVerificationEmail } =
      await setup({ _id: USER_ID, emailVerified: null, passwordHash: null })

    const res = await POST(makeReq('jane@acme.test'))

    expect(res.status).toBe(200)
    expect(issueVerificationToken).toHaveBeenCalledWith(USER_ID, 'jane@acme.test', 'set_password')
    expect(sendSetPasswordEmail).toHaveBeenCalledOnce()
    expect(sendVerificationEmail).not.toHaveBeenCalled()
  })

  it('still sends a verification link when the account has a password', async () => {
    const { POST, issueVerificationToken, sendSetPasswordEmail, sendVerificationEmail } =
      await setup({ _id: USER_ID, emailVerified: null, passwordHash: 'hash' })

    await POST(makeReq('jane@acme.test'))

    expect(issueVerificationToken).toHaveBeenCalledWith(USER_ID, 'jane@acme.test', 'email_verify')
    expect(sendVerificationEmail).toHaveBeenCalledOnce()
    expect(sendSetPasswordEmail).not.toHaveBeenCalled()
  })

  it('covers a verified account that somehow still has no password', async () => {
    const { POST, sendSetPasswordEmail } = await setup({
      _id: USER_ID,
      emailVerified: new Date(),
      passwordHash: null,
    })

    await POST(makeReq('jane@acme.test'))

    expect(sendSetPasswordEmail).toHaveBeenCalledOnce()
  })

  it('answers neutrally for an unknown address without sending anything', async () => {
    const { POST, sendVerificationEmail, sendSetPasswordEmail } = await setup(null)

    const res = await POST(makeReq('nobody@acme.test'))

    expect(res.status).toBe(200)
    expect(sendVerificationEmail).not.toHaveBeenCalled()
    expect(sendSetPasswordEmail).not.toHaveBeenCalled()
  })
})

describe('issueVerificationToken — the TTL matches who is waiting for the link', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function setup() {
    // vi.resetModules() clears the module registry but not doMock registrations,
    // so the stub the block above installed for this module is still armed.
    vi.doUnmock('@/lib/verification')
    vi.resetModules()
    const create = vi.fn().mockResolvedValue({})
    vi.doMock('@/lib/models/VerificationToken', () => ({
      VerificationToken: { deleteMany: vi.fn().mockResolvedValue({}), create },
    }))
    // Return the namespace itself — spreading a module namespace object drops
    // its live bindings under vitest's ESM interop.
    const mod = await import('@/lib/verification')
    return { create, mod }
  }

  it('keeps email verification at one hour — the user just asked for it', async () => {
    const { create, mod } = await setup()
    const before = Date.now()
    const { expiresAt } = await mod.issueVerificationToken(USER_ID, 'a@b.test', 'email_verify')

    expect(mod.VERIFICATION_TTL_MS).toBe(60 * 60 * 1000)
    expect(expiresAt.getTime() - before).toBeGreaterThan(59 * 60 * 1000)
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(60 * 60 * 1000 + 1000)
    // Only the hash is persisted; the plaintext exists to be put in the email.
    expect(create.mock.calls[0][0].token).not.toBe('a@b.test')
    expect(create.mock.calls[0][0].token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('gives set-password seven days — its recipient never asked for the account', async () => {
    const { mod } = await setup()
    const before = Date.now()
    const { expiresAt } = await mod.issueVerificationToken(USER_ID, 'a@b.test', 'set_password')

    expect(mod.SET_PASSWORD_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000)
    expect(expiresAt.getTime() - before).toBeGreaterThan(6 * 24 * 60 * 60 * 1000)
  })
})

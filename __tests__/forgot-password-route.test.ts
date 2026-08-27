import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = '507f1f77bcf86cd799439012'

function reqWith(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '203.0.113.9',
    },
    body: JSON.stringify(body),
  })
}

/**
 * The endpoint's shape is deliberately narrow: it must NEVER confirm or deny
 * that an address maps to an account, must never distinguish between "not
 * verified", "no password" and "unknown", and must throttle. These tests pin
 * that contract — the copy on /forgot-password relies on it.
 */
describe('POST /api/auth/forgot-password — reveals nothing about the address', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  async function setup(user: Record<string, unknown> | null) {
    const issueVerificationToken = vi.fn().mockResolvedValue({
      token: 'tok',
      expiresAt: new Date('2026-09-03T09:00:00Z'),
    })
    const sendPasswordResetEmail = vi.fn().mockResolvedValue(true)

    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('@/lib/models/User', () => ({
      User: {
        findOne: () => ({ select: () => Promise.resolve(user) }),
      },
    }))
    vi.doMock('@/lib/verification', () => ({
      issueVerificationToken,
      resetPasswordLink: (t: string) => `https://kamnotheat.example/reset-password/${t}`,
    }))
    vi.doMock('@/lib/email/send', () => ({
      sendPasswordResetEmail,
      smtpConfigured: () => true,
    }))
    vi.doMock('@/lib/rateLimit', () => ({
      rateLimit: () => ({ ok: true, retryAfter: 0 }),
      clientKey: () => 'k',
    }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))

    const { POST } = await import('@/app/api/auth/forgot-password/route')
    return { POST, issueVerificationToken, sendPasswordResetEmail }
  }

  it('sends a reset link for a verified account with a password', async () => {
    const { POST, issueVerificationToken, sendPasswordResetEmail } = await setup({
      _id: USER_ID,
      emailVerified: new Date(),
      passwordHash: 'hash',
    })
    const res = await POST(reqWith({ email: 'alice@acme.test' }))

    expect(res.status).toBe(200)
    expect(issueVerificationToken).toHaveBeenCalledWith(
      USER_ID,
      'alice@acme.test',
      'password_reset',
    )
    expect(sendPasswordResetEmail).toHaveBeenCalledOnce()
    const body = await res.json()
    expect(body.mailConfigured).toBe(true)
    // Neutral copy — no confirmation that the address exists.
    expect(body.message).toMatch(/if an account exists/i)
  })

  it('answers neutrally for an unknown address without sending anything', async () => {
    const { POST, sendPasswordResetEmail } = await setup(null)
    const res = await POST(reqWith({ email: 'nobody@acme.test' }))

    expect(res.status).toBe(200)
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.message).toMatch(/if an account exists/i)
  })

  it('refuses to reset for an unverified account (send nothing, respond neutrally)', async () => {
    const { POST, sendPasswordResetEmail } = await setup({
      _id: USER_ID,
      emailVerified: null,
      passwordHash: 'hash',
    })
    const res = await POST(reqWith({ email: 'alice@acme.test' }))

    expect(res.status).toBe(200)
    // Only verified accounts with a real password get a reset link; unverified
    // accounts use the resend-verification path instead.
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
  })

  it('refuses to reset for a passwordless account (uses set-password flow instead)', async () => {
    const { POST, sendPasswordResetEmail } = await setup({
      _id: USER_ID,
      emailVerified: new Date(),
      passwordHash: null,
    })
    const res = await POST(reqWith({ email: 'alice@acme.test' }))

    expect(res.status).toBe(200)
    expect(sendPasswordResetEmail).not.toHaveBeenCalled()
  })
})

describe('POST /api/auth/forgot-password — rate limits', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns 429 with Retry-After when the limiter trips', async () => {
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/User', () => ({
      User: { findOne: () => ({ select: () => Promise.resolve(null) }) },
    }))
    vi.doMock('@/lib/verification', () => ({
      issueVerificationToken: vi.fn(),
      resetPasswordLink: () => 'x',
    }))
    vi.doMock('@/lib/email/send', () => ({
      sendPasswordResetEmail: vi.fn(),
      smtpConfigured: () => true,
    }))
    vi.doMock('@/lib/rateLimit', () => ({
      rateLimit: () => ({ ok: false, retryAfter: 300 }),
      clientKey: () => 'k',
    }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))

    const { POST } = await import('@/app/api/auth/forgot-password/route')
    const res = await POST(reqWith({ email: 'a@b.test' }))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('300')
  })
})

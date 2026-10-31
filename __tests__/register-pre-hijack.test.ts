import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Registering an address that already has an UNVERIFIED account must trust no
// one's password: neither keep the first registrant's (an attacker who
// pre-registered the victim's address would then log in once the victim
// verifies) nor adopt this request's. The stored hash is dropped and a
// set-password link, usable only by the inbox owner, is mailed instead.
describe('POST /api/auth/register — unverified account pre-hijack', () => {
  beforeEach(() => vi.resetModules())

  it('adopts neither password and mails a set-password link', async () => {
    const save = vi.fn()
    const existing: any = {
      _id: 'u1',
      emailVerified: null,
      name: 'Victim',
      passwordHash: 'victim-hash',
      save,
    }
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/User', () => ({ User: { findOne: vi.fn().mockResolvedValue(existing) } }))
    vi.doMock('@/lib/models/Team', () => ({ Team: {} }))
    vi.doMock('@/lib/models/TeamMember', () => ({ TeamMember: { exists: vi.fn().mockResolvedValue({ _id: 'owned' }) } }))
    const reissueAsSetPassword = vi.fn().mockResolvedValue({ token: 't', expiresAt: new Date() })
    const sendSetPasswordEmail = vi.fn().mockResolvedValue(true)
    vi.doMock('@/lib/verification', () => ({
      issueVerificationToken: vi.fn().mockResolvedValue({ token: 't', expiresAt: new Date() }),
      reissueAsSetPassword,
      discardIfUndelivered: async () => {},
      verifyEmailLink: (t: string) => `https://x.test/verify/${t}`,
      setPasswordLink: (t: string) => `https://x.test/set-password/${t}`,
    }))
    vi.doMock('@/lib/email/send', () => ({
      sendVerificationEmail: vi.fn().mockResolvedValue(true),
      sendSetPasswordEmail,
      smtpConfigured: () => true,
    }))
    vi.doMock('@/lib/rateLimitShared', () => ({ rateLimitShared: async () => ({ ok: true }) }))
    vi.doMock('@/lib/rateLimit', () => ({ clientKey: () => 'k' }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))

    const { POST } = await import('@/app/api/auth/register/route')
    const res = await POST(
      new NextRequest('http://localhost/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Attacker',
          email: 'victim@acme.test',
          password: 'attacker-pass',
          teamName: 'Evil',
        }),
      }),
    )

    expect(res.status).toBe(201)
    expect(save).not.toHaveBeenCalled()
    expect(existing.name).toBe('Victim')
    expect(reissueAsSetPassword).toHaveBeenCalledWith('u1', 'victim@acme.test')
    expect(sendSetPasswordEmail).toHaveBeenCalledOnce()
  })
})

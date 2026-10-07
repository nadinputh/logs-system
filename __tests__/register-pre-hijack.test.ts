import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Registering an address that already has an UNVERIFIED account must not
// overwrite that account's credentials — only resend the link.
describe('POST /api/auth/register — unverified account pre-hijack', () => {
  beforeEach(() => vi.resetModules())

  it('leaves the existing account untouched and resends the link', async () => {
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
    vi.doMock('@/lib/models/TeamMember', () => ({ TeamMember: {} }))
    vi.doMock('@/lib/verification', () => ({
      issueVerificationToken: vi.fn().mockResolvedValue({ token: 't', expiresAt: new Date() }),
      verifyEmailLink: (t: string) => `https://x.test/verify/${t}`,
    }))
    vi.doMock('@/lib/email/send', () => ({ sendVerificationEmail: vi.fn().mockResolvedValue(true) }))
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
    expect(existing.passwordHash).toBe('victim-hash')
    expect(existing.name).toBe('Victim')
  })
})

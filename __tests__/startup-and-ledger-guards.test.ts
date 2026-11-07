import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamAuditLog } from '@/lib/models/TeamAuditLog'
import { register } from '@/instrumentation'

describe('TeamAuditLog is append-only', () => {
  it('refuses every mutation through Mongoose', async () => {
    await expect(TeamAuditLog.updateOne({}, { action: 'member_removed' })).rejects.toThrow(/append-only/)
    await expect(TeamAuditLog.deleteMany({})).rejects.toThrow(/append-only/)
    await expect(TeamAuditLog.findOneAndUpdate({}, {})).rejects.toThrow(/append-only/)
  })
})

describe('NEXTAUTH_SECRET startup check', () => {
  afterEach(() => vi.unstubAllEnvs())

  const prod = (secret?: string) => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXTAUTH_SECRET', secret ?? '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
  }

  it.each([undefined, 'short', 'replace-with-a-random-32-char-secret'])('refuses %s in production', (s) => {
    prod(s)
    expect(() => register()).toThrow(/NEXTAUTH_SECRET/)
  })

  it('accepts a strong secret in production', () => {
    prod('k3J9xQ2mVb7LpR4tYw8NcZ1uHd5SfGa0eXoIvB6A')
    expect(() => register()).not.toThrow()
  })

  it('does not block development', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXTAUTH_SECRET', '')
    expect(() => register()).not.toThrow()
  })
})

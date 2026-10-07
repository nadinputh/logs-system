import { afterEach, describe, expect, it } from 'vitest'
import { pickClientIp } from '@/lib/server/getClientIp'

afterEach(() => {
  delete process.env.TRUSTED_PROXY_HOPS
})

describe('pickClientIp', () => {
  it('ignores client-supplied leading entries and trusts the proxy-appended one', () => {
    // client sent "1.1.1.1"; our proxy appended the real address.
    expect(pickClientIp('1.1.1.1, 203.0.113.7')).toBe('203.0.113.7')
  })

  it('a single entry (Vercel overwrites the header) is used as is', () => {
    expect(pickClientIp('203.0.113.7')).toBe('203.0.113.7')
  })

  it('counts from the end by TRUSTED_PROXY_HOPS when more proxies sit in front', () => {
    process.env.TRUSTED_PROXY_HOPS = '2'
    expect(pickClientIp('6.6.6.6, 203.0.113.7, 10.0.0.1')).toBe('203.0.113.7')
    expect(pickClientIp('203.0.113.7')).toBe('203.0.113.7') // fewer entries than hops
  })

  it('falls back to x-real-ip, then unknown', () => {
    expect(pickClientIp(null, '198.51.100.2')).toBe('198.51.100.2')
    expect(pickClientIp('', null)).toBe('unknown')
  })
})

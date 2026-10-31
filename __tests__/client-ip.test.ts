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

describe('ipBucket — limiter keys cannot be dodged by rotating within an IPv6 /64', () => {
  it('collapses addresses in one /64 to one bucket, leaves IPv4 alone', async () => {
    const { ipBucket } = await import('@/lib/server/getClientIp')
    expect(ipBucket('2001:db8:aaaa:bbbb:1:2:3:4')).toBe(ipBucket('2001:db8:aaaa:bbbb:ffff:eeee:dddd:cccc'))
    expect(ipBucket('2001:db8:aaaa:bbbb::1')).toBe(ipBucket('2001:db8:aaaa:bbbb:9::2'))
    expect(ipBucket('2001:db8:aaaa:bbbb::1')).not.toBe(ipBucket('2001:db8:aaaa:cccc::1'))
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7')
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(ipBucket('unknown')).toBe('unknown')
  })
})

describe('ipBucket — IPv4-mapped IPv6 in any spelling buckets as the IPv4 address', () => {
  it('does not collapse long-form mapped addresses into one shared bucket', async () => {
    const { ipBucket } = await import('@/lib/server/getClientIp')
    expect(ipBucket('0:0:0:0:0:ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7')
    expect(ipBucket('0:0:0:0:0:ffff:203.0.113.8')).not.toBe(ipBucket('0:0:0:0:0:ffff:203.0.113.7'))
  })
})

describe('ipBucket — a source port appended by the proxy does not split the bucket', () => {
  it('strips :port from IPv4 and [IPv6]:port', async () => {
    const { ipBucket } = await import('@/lib/server/getClientIp')
    expect(ipBucket('203.0.113.7:51234')).toBe('203.0.113.7')
    expect(ipBucket('203.0.113.7:51234')).toBe(ipBucket('203.0.113.7:9'))
    expect(ipBucket('[2001:db8:aaaa:bbbb::1]:443')).toBe(ipBucket('2001:db8:aaaa:bbbb::9'))
  })
})

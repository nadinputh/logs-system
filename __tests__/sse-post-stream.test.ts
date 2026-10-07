import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { readSse } from '@/lib/useLogRealtime'

afterEach(() => vi.unstubAllGlobals())

function streamOf(chunks: string[]) {
  const enc = new TextEncoder()
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch))
      c.close()
    },
  })
}

describe('readSse (POST-based stream reader)', () => {
  it('POSTs the credential in the body, not the URL, and parses frames split across chunks', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        streamOf([
          ': connected\n\n',
          'event: log.created\ndata: {"logId":"a"}\n\nevent: log.cr',
          'eated\ndata: {"logId":"b"}\n\n',
        ]),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    const seen: Array<[string, string]> = []
    await readSse('/api/realtime/guest-log', { sessionToken: 'S' }, new AbortController().signal, (e, d) => seen.push([e, d]))

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/realtime/guest-log')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ sessionToken: 'S' })
    expect(seen).toEqual([
      ['log.created', '{"logId":"a"}'],
      ['log.created', '{"logId":"b"}'],
    ])
  })
})

describe('guest-log route', () => {
  it('is POST-only and rejects a non-UUID token before any lookup', async () => {
    vi.resetModules()
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/csrf', () => ({ assertSameOrigin: () => null }))
    vi.doMock('@/lib/models/Log', () => ({ Log: {} }))
    vi.doMock('@/lib/locationOwnership', () => ({ findOwnedLocationById: vi.fn() }))
    const mod = await import('@/app/api/realtime/guest-log/route')
    expect((mod as any).GET).toBeUndefined()
    const res = await mod.POST(
      new NextRequest('http://localhost/api/realtime/guest-log', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locationId: 'l', sessionToken: 'nope' }),
      }),
    )
    expect(res.status).toBe(400)
  })
})

import { describe, expect, it } from 'vitest'
import { describeFailure, resolveDecoded } from '@/lib/scanner/decode'

const ORIGIN = 'https://kamnotheat.example'

describe('resolveDecoded — routes this product owns', () => {
  it('follows a relative room code', () => {
    expect(resolveDecoded('/scan/6650f0a2c1d4e8b9a7f30011', ORIGIN)).toEqual({
      kind: 'route',
      href: '/scan/6650f0a2c1d4e8b9a7f30011',
    })
  })

  it('follows an absolute same-origin URL and preserves the query', () => {
    expect(resolveDecoded(`${ORIGIN}/scan/abc?token=xyz`, ORIGIN)).toEqual({
      kind: 'route',
      href: '/scan/abc?token=xyz',
    })
  })

  it('follows quest and terminal routes', () => {
    expect(resolveDecoded('/quest/tok123', ORIGIN).kind).toBe('route')
    expect(resolveDecoded('/terminal', ORIGIN).kind).toBe('route')
  })

  it('drops the hash, which is never part of a check-in target', () => {
    expect(resolveDecoded('/scan/abc#frag', ORIGIN)).toEqual({
      kind: 'route',
      href: '/scan/abc',
    })
  })
})

describe('resolveDecoded — untrusted input is refused, not followed', () => {
  it('refuses another origin even on an allowed path', () => {
    expect(resolveDecoded('https://evil.example/scan/abc', ORIGIN).kind).toBe('foreign')
  })

  it('refuses a protocol-relative URL, which parses to a foreign origin', () => {
    // `//evil.example/scan/abc` yields pathname `/scan/abc` — it passes the
    // prefix test and is caught only by the origin check.
    const r = resolveDecoded('//evil.example/scan/abc', ORIGIN)
    expect(r.kind).toBe('foreign')
  })

  it('refuses a javascript: payload', () => {
    expect(resolveDecoded('javascript:alert(1)', ORIGIN).kind).toBe('foreign')
  })

  it('refuses a same-origin route this scanner does not own', () => {
    expect(resolveDecoded('/admin/logs', ORIGIN).kind).toBe('foreign')
    expect(resolveDecoded('/api/logs', ORIGIN).kind).toBe('foreign')
  })

  it('refuses a path that only looks like an allowed prefix', () => {
    expect(resolveDecoded('/scanner-settings', ORIGIN).kind).toBe('foreign')
  })

  it('refuses arbitrary text, e.g. a wifi card', () => {
    const r = resolveDecoded('WIFI:S=Lobby;T=WPA;P=hunter2;;', ORIGIN)
    expect(r.kind).toBe('foreign')
  })

  it('tells the visitor the scan is still running rather than ending it', () => {
    // The whole point of the `foreign` branch: a stray code in frame must not
    // read as a dead end, because the camera is still live.
    for (const text of ['not a url at all', 'https://evil.example/scan/abc', '/admin']) {
      const r = resolveDecoded(text, ORIGIN)
      expect(r.kind).toBe('foreign')
      if (r.kind === 'foreign') {
        expect(r.notice).toMatch(/still looking/i)
        expect(r.notice).not.toMatch(/try again/i)
      }
    }
  })
})

describe('describeFailure — every cause is named and correctly classified', () => {
  it('reads a DOMException name', () => {
    const f = describeFailure(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    expect(f.title).toBe('Camera access is blocked')
    expect(f.retryable).toBe(true)
  })

  it('reads html5-qrcode plain-string rejections, not just err.name', () => {
    // The regression this guards: matching on `err.name` alone collapses every
    // string rejection into the generic cause.
    const f = describeFailure('Error getting userMedia, error = NotFoundError: no camera')
    expect(f.title).toBe('No camera found')
    expect(f.retryable).toBe(false)
  })

  it('classifies a busy camera as retryable and a missing one as not', () => {
    expect(describeFailure({ name: 'NotReadableError' }).retryable).toBe(true)
    expect(describeFailure({ name: 'OverconstrainedError' }).retryable).toBe(false)
    expect(describeFailure({ name: 'NotSupportedError' }).retryable).toBe(false)
  })

  it('classifies the watchdog timeout as retryable', () => {
    const f = describeFailure(
      Object.assign(new Error('camera-timeout'), { name: 'KamnotheatTimeout' }),
    )
    expect(f.title).toBe('The camera did not open')
    expect(f.retryable).toBe(true)
  })

  it('falls back to a retryable generic cause', () => {
    const f = describeFailure(new Error('something odd'))
    expect(f.title).toBe("The scanner couldn't start")
    expect(f.retryable).toBe(true)
  })

  it('never leaks the raw browser message to the visitor', () => {
    const f = describeFailure(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }),
    )
    expect(`${f.title} ${f.detail}`).not.toMatch(/NotAllowedError/)
  })

  it('only says "try again" where retrying is actually possible', () => {
    // A dead end that says "try again" beside no button was a shipped defect.
    const deadEnds = [
      { name: 'NotFoundError' },
      { name: 'OverconstrainedError' },
      { name: 'NotSupportedError' },
    ]
    for (const err of deadEnds) {
      const f = describeFailure(err)
      expect(f.retryable).toBe(false)
      expect(`${f.title} ${f.detail}`).not.toMatch(/try again/i)
    }
  })
})

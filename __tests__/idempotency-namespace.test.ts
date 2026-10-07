import { beforeEach, describe, expect, it, vi } from 'vitest'

// A client-supplied Idempotency-Key must not be able to read, overwrite or
// crash on records that claim() stores in the same collection.
describe('lib/idempotency — key namespace and validation', () => {
  const store = new Map<string, { key: string; statusCode: number; body: string }>()

  beforeEach(() => {
    vi.resetModules()
    store.clear()
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn().mockResolvedValue(undefined) }))
    vi.doMock('@/lib/models/IdempotencyKey', () => ({
      IdempotencyKey: {
        findOne: ({ key }: { key: string }) => ({ lean: async () => store.get(key) ?? null }),
        findOneAndUpdate: async ({ key }: { key: string }, doc: any) => {
          store.set(key, doc)
        },
      },
    }))
  })

  it('cannot read a claim() record by sending its key as an Idempotency-Key', async () => {
    store.set('sessionqr:abc', { key: 'sessionqr:abc', statusCode: 0, body: 'user-1' }) // not JSON
    const { checkIdempotency } = await import('@/lib/idempotency')
    expect(await checkIdempotency('sessionqr:abc')).toBeNull()
  })

  it('cannot overwrite a claim() record', async () => {
    store.set('kiosk:j1', { key: 'kiosk:j1', statusCode: 0, body: 'sess-1' })
    const { saveIdempotency } = await import('@/lib/idempotency')
    await saveIdempotency('kiosk:j1', 201, { x: 1 }) // invalid format: ignored
    expect(store.get('kiosk:j1')!.body).toBe('sess-1')
    expect(store.size).toBe(1)
  })

  it('round-trips a valid key under its own prefix', async () => {
    const { checkIdempotency, saveIdempotency } = await import('@/lib/idempotency')
    const key = 'a'.repeat(64)
    await saveIdempotency(key, 201, { ok: true })
    expect([...store.keys()]).toEqual([`idem:${key}`])
    expect(await checkIdempotency(key)).toEqual({ statusCode: 201, body: { ok: true } })
  })

  it('rejects empty and oversized keys, and survives an unparsable stored body', async () => {
    const { checkIdempotency, saveIdempotency } = await import('@/lib/idempotency')
    await saveIdempotency('', 201, {})
    await saveIdempotency('k'.repeat(129), 201, {})
    expect(store.size).toBe(0)
    store.set('idem:bad', { key: 'idem:bad', statusCode: 201, body: 'not json' })
    expect(await checkIdempotency('bad')).toBeNull()
  })
})

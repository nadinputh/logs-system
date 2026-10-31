import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const req = (auth?: string) =>
  new NextRequest('http://localhost/api/cron/report-unverified', { headers: auth ? { authorization: auth } : {} })

describe('report-unverified cron', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.CRON_SECRET = 's3cret'
  })

  async function setup(counts: number[]) {
    const countDocuments = vi.fn()
    counts.forEach((c) => countDocuments.mockResolvedValueOnce(c))
    vi.doMock('@/lib/db', () => ({ connectDB: vi.fn() }))
    vi.doMock('@/lib/models/User', () => ({ User: { countDocuments, deleteMany: vi.fn(), deleteOne: vi.fn() } }))
    const { GET } = await import('@/app/api/cron/report-unverified/route')
    return { GET, countDocuments }
  }

  it('is fail-closed: no secret configured, or a wrong one, is 401', async () => {
    delete process.env.CRON_SECRET
    expect((await (await setup([])).GET(req())).status).toBe(401)
    process.env.CRON_SECRET = 's3cret'
    expect((await (await setup([])).GET(req('Bearer nope'))).status).toBe(401)
  })

  it('only counts: returns the numbers and never deletes anything', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { GET } = await setup([7, 5])
    const res = await GET(req('Bearer s3cret'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ staleUnverified: 7, withoutPassword: 5 })
    const { User } = await import('@/lib/models/User')
    expect((User as any).deleteMany).not.toHaveBeenCalled()
    expect((User as any).deleteOne).not.toHaveBeenCalled()
    info.mockRestore()
  })
})

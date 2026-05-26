import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Floor } from '@/lib/models/Floor'
import { requireAuth } from '@/lib/middleware/auth'
import { CreateFloorSchema } from '@/lib/validations/location'

export const runtime = 'nodejs'

export async function GET() {
  await connectDB()
  const floors = await Floor.find({}).sort({ buildingId: 1, number: 1 }).lean()
  return NextResponse.json(floors)
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth('admin')
  if (error) return error

  const body = await req.json()
  const parsed = CreateFloorSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  await connectDB()
  const floor = await Floor.create(parsed.data)
  return NextResponse.json(floor, { status: 201 })
}

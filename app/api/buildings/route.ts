import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Building } from '@/lib/models/Building'
import { requireAuth } from '@/lib/middleware/auth'
import { CreateBuildingSchema } from '@/lib/validations/location'

export const runtime = 'nodejs'

export async function GET() {
  await connectDB()
  const buildings = await Building.find({}).sort({ name: 1 }).lean()
  return NextResponse.json(buildings)
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth('admin')
  if (error) return error

  const body = await req.json()
  const parsed = CreateBuildingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  await connectDB()
  const building = await Building.create(parsed.data)
  return NextResponse.json(building, { status: 201 })
}

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Room } from '@/lib/models/Room'
import { requireAuth } from '@/lib/middleware/auth'
import { CreateRoomSchema } from '@/lib/validations/location'

export const runtime = 'nodejs'

export async function GET() {
  await connectDB()
  const rooms = await Room.find({}).sort({ buildingId: 1, number: 1 }).lean()
  return NextResponse.json(rooms)
}

export async function POST(req: NextRequest) {
  const { error } = await requireAuth('admin')
  if (error) return error

  const body = await req.json()
  const parsed = CreateRoomSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  await connectDB()
  const room = await Room.create(parsed.data)
  return NextResponse.json(room, { status: 201 })
}

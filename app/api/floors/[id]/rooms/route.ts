import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { Room } from '@/lib/models/Room'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await connectDB()
  const rooms = await Room.find({ floorId: params.id }).sort({ number: 1 }).lean()
  return NextResponse.json(rooms)
}

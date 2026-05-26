import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { QuestCard } from '@/lib/models/QuestCard'
import { requireAuth } from '@/lib/middleware/auth'
import { CreateQuestCardSchema } from '@/lib/validations/quest'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { error } = await requireAuth()
  if (error) return error

  await connectDB()
  const quests = await QuestCard.find({}).sort({ createdAt: -1 }).lean()
  return NextResponse.json(quests)
}

export async function POST(req: NextRequest) {
  const { error, session } = await requireAuth('admin')
  if (error) return error

  const body = await req.json()
  const parsed = CreateQuestCardSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  await connectDB()
  const { count, ...cardData } = parsed.data
  const issuedBy = (session!.user as any).id

  const cards = await QuestCard.insertMany(
    Array.from({ length: count }, () => ({
      ...cardData,
      issuedBy,
      qrToken: uuidv4(),
    }))
  )

  return NextResponse.json(cards, { status: 201 })
}

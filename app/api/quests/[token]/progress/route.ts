import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { connectDB } from '@/lib/db'
import { QuestCard } from '@/lib/models/QuestCard'
import { QuestProgress } from '@/lib/models/QuestProgress'
import { QuestProgressSchema } from '@/lib/validations/quest'

export const runtime = 'nodejs'

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const body = await req.json()
  const parsed = QuestProgressSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { locationId, locationType, sessionToken } = parsed.data
  const session = await getServerSession(authOptions)
  await connectDB()

  const card = await QuestCard.findOne({ qrToken: params.token, isActive: true })
  if (!card) return NextResponse.json({ error: 'Quest not found' }, { status: 404 })

  let progress = await QuestProgress.findOne({ questCardId: card._id })
  if (!progress) {
    progress = new QuestProgress({
      questCardId: card._id,
      sessionToken,
      userId: session?.user ? (session.user as any).id : undefined,
      completedSteps: [],
    })
  }

  const alreadyDone = progress.completedSteps.some(
    (s) => s.locationId.toString() === locationId
  )
  if (alreadyDone) {
    return NextResponse.json({ message: 'Already recorded', progress }, { status: 200 })
  }

  if (card.type === 'location_chain') {
    const nextStep = card.steps.find(
      (s) => !progress!.completedSteps.some((cs) => cs.stepOrder === s.order)
    )
    if (!nextStep || nextStep.locationId.toString() !== locationId) {
      return NextResponse.json({ error: 'Not the next location in sequence' }, { status: 400 })
    }
    progress.completedSteps.push({ stepOrder: nextStep.order, locationId: nextStep.locationId, timestamp: new Date() })
  } else {
    const step = card.steps.find((s) => s.locationId.toString() === locationId)
    if (!step) return NextResponse.json({ error: 'Location not in this quest' }, { status: 400 })
    progress.completedSteps.push({ stepOrder: step.order, locationId: step.locationId, timestamp: new Date() })
  }

  if (progress.completedSteps.length >= card.steps.length) {
    progress.completedAt = new Date()
  }

  await progress.save()
  return NextResponse.json({ progress, completed: !!progress.completedAt })
}

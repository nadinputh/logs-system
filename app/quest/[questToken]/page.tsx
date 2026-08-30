import Link from 'next/link'
import { AlertTriangle, CheckCircle2, QrCode, Sparkles } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { connectDB } from '@/lib/db'
import { QuestCard } from '@/lib/models/QuestCard'
import { QuestProgress } from '@/lib/models/QuestProgress'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getQuestData(token: string) {
  try {
    await connectDB()
    const card = await QuestCard.findOne({ qrToken: token, isActive: true }).lean<any>()
    if (!card) return null
    const progress = await QuestProgress.findOne({
      teamId: card.teamId,
      questCardId: card._id,
    }).lean<any>()
    return JSON.parse(JSON.stringify({ card, progress: progress ?? null }))
  } catch { return null }
}

export default async function QuestPage({ params }: { params: Promise<{ questToken: string }> }) {
  const { questToken } = await params
  const data = await getQuestData(questToken)

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="p-4">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-[var(--status-danger)]" aria-hidden />
          </div>
          <h1 className="font-bold text-foreground">Quest not found</h1>
          <p className="text-sm text-muted mt-1.5">This quest card QR may be invalid.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { card, progress } = data
  const completedStepOrders = new Set((progress?.completedSteps ?? []).map((s: any) => s.stepOrder))
  const totalSteps = card.steps.length
  const completedCount = completedStepOrders.size

  const pct = totalSteps ? Math.round((completedCount / totalSteps) * 100) : 0

  return (
    <div className="min-h-screen bg-background flex items-start justify-center p-4 pt-8 pb-16">
      <div className="w-full max-w-sm space-y-3">
        {/* Quest card */}
        <Card className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full text-foreground bg-muted">
                    {card.type === 'location_chain' ? 'Location Chain' : 'Custom'}
                  </span>
                  {progress?.completedAt && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--status-success)] bg-[var(--status-success)]/10 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="w-3 h-3" aria-hidden />
                      Completed!
                    </span>
                  )}
                </div>
                <h1 className="text-lg font-bold text-foreground leading-tight">{card.title}</h1>
                {card.description && <p className="text-sm text-muted">{card.description}</p>}
              </div>
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles className="w-5 h-5 text-white" aria-hidden />
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Progress</span>
                <span className="font-semibold text-foreground">{completedCount}/{totalSteps}</span>
              </div>
              <div
                className="h-2 bg-muted rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={completedCount}
                aria-valuemin={0}
                aria-valuemax={totalSteps}
                aria-label="Quest progress"
              >
                <div
                  className="h-full gradient-primary rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            {/* Steps list */}
            <ol className="space-y-2">
              {card.steps.sort((a: any, b: any) => a.order - b.order).map((step: any) => {
                const done = completedStepOrders.has(step.order)
                return (
                  <li key={step.order} className={`flex items-start gap-3 p-3 rounded-xl border ${
                    done ? 'bg-[var(--status-success)]/10 border-[var(--status-success)]/25' : 'bg-muted/30 border-border/40'
                  }`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                      done ? 'bg-[var(--status-success)] text-white' : 'bg-muted-foreground/20 text-muted'
                    }`}>
                      {done ? '✓' : step.order + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium capitalize text-foreground">{step.locationType} visit</p>
                      {step.challenge && <p className="text-xs text-muted italic mt-0.5">{step.challenge}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
          </CardContent>
        </Card>

        {/* Scan CTA */}
        <Card>
          <CardContent className="p-4 space-y-3">
          {/* Same routing truth as the landing: the phone's own camera opens
              the location code directly. The in-app scanner is the fallback,
              and saying so keeps a quest participant from paying a camera cold
              start at every stop when they do not have to. */}
          <p className="text-sm text-muted">
            At a location? Point your phone&apos;s camera at its QR code to record the
            visit. If it doesn&apos;t open, use the scanner here.
          </p>
          <Link
            href="/scan"
            className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
          >
            <QrCode className="w-4 h-4" aria-hidden />
            Open Scanner
          </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

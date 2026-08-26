import Link from 'next/link'
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-teal-50/20 flex items-center justify-center p-4">
        <Card className="w-full max-w-sm text-center">
          <CardContent className="p-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="font-bold text-foreground">Quest not found</h2>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-cyan-50/30 to-teal-50/20 flex items-start justify-center p-4 pt-8 pb-16">
      <div className="w-full max-w-sm space-y-3">
        {/* Quest card */}
        <Card className="overflow-hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full text-sky-600 bg-sky-50">
                    {card.type === 'location_chain' ? 'Location Chain' : 'Custom'}
                  </span>
                  {progress?.completedAt && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                      Completed!
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-foreground leading-tight">{card.title}</h2>
                {card.description && <p className="text-sm text-muted">{card.description}</p>}
              </div>
              <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shrink-0 shadow-sm">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted">Progress</span>
                <span className="font-semibold text-foreground">{completedCount}/{totalSteps}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
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
                    done ? 'bg-emerald-50 border-emerald-200/60' : 'bg-muted/30 border-border/40'
                  }`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 ${
                      done ? 'bg-emerald-500 text-white' : 'bg-muted-foreground/20 text-muted'
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
            Open Scanner
          </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

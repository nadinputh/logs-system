import QRCodeDisplay from '@/components/admin/QRCodeDisplay'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { connectDB } from '@/lib/db'
import { QuestCard } from '@/lib/models/QuestCard'
import { resolveLocationLabels } from '@/lib/locationLabels'
import { QrCode, Sparkles } from 'lucide-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getQuest(id: string) {
  try {
    await connectDB()
    const quest = await QuestCard.findById(id).lean<any>()
    if (!quest) return null
    const labels = await resolveLocationLabels(
      (quest.steps ?? []).map((s: any) => ({
        locationType: s.locationType,
        locationId: s.locationId,
      })),
    )
    const stepsWithLabels = (quest.steps ?? []).map((s: any) => {
      const label = labels.get(`${s.locationType}:${s.locationId.toString()}`)
      return {
        ...s,
        locationName: label?.name ?? null,
        locationPath: label?.path ?? null,
      }
    })
    return JSON.parse(JSON.stringify({ ...quest, steps: stepsWithLabels }))
  } catch { return null }
}

export default async function AdminQuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const quest = await getQuest(id)
  if (!quest) return <div className="p-8 text-red-500">Quest not found</div>

  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const qrUrl = `${appUrl}/quest/${quest.qrToken}`

  return (
    <div className="p-6 sm:p-8 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link
          href="/admin/quests"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
        >
          ← Back
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{quest.title}</h1>
            <span className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full text-sky-600 bg-sky-50">
              {quest.type === 'location_chain' ? 'Location Chain' : 'Custom'}
            </span>
          </div>
          {quest.description && <p className="text-sm text-muted-foreground mt-0.5">{quest.description}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* QR card */}
        <Card className="overflow-hidden bg-white" data-qr-export-card="true">
          <CardContent className="p-5">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl gradient-primary text-white shadow-sm shadow-cyan-200">
                <QrCode className="size-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Quest Card QR</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="size-3.5" />
                  Give this to participants
                </p>
              </div>
            </div>
            <div className="flex justify-center">
              <QRCodeDisplay
                url={qrUrl}
                label={quest.title}
                sublabel={quest.type}
                exportTitle="Quest Card QR"
                exportDescription="Give this to participants"
              />
            </div>
          </CardContent>
        </Card>

        {/* Steps card */}
        <Card className="overflow-hidden">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-foreground mb-4">Steps ({quest.steps.length})</p>
            <ol className="space-y-2">
              {quest.steps.sort((a: any, b: any) => a.order - b.order).map((step: any) => (
                <li key={step.order} className="flex items-start gap-3 p-2.5 rounded-xl bg-muted/30 border border-border/40">
                  <span className="w-6 h-6 rounded-full bg-cyan-100 text-cyan-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                    {step.order + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate" title={step.locationPath ?? undefined}>
                      {step.locationName ?? <span className="text-muted-foreground italic">Unknown location</span>}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{step.locationType}{step.locationPath && step.locationPath !== step.locationName ? ` · ${step.locationPath}` : ''}</p>
                    {step.challenge && <p className="text-xs text-muted-foreground italic mt-0.5">{step.challenge}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

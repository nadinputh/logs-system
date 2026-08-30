import QRCodeDisplay from '@/components/admin/QRCodeDisplay'
import ReissueQuestCardButton from '@/components/admin/ReissueQuestCardButton'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { connectDB } from '@/lib/db'
import { QuestCard } from '@/lib/models/QuestCard'
import { QuestProgress } from '@/lib/models/QuestProgress'
import { resolveLocationLabels } from '@/lib/locationLabels'
import { requireTeamPageAccess } from '@/lib/server/requireTeamPageAccess'
import { ArrowLeft, CheckCircle2, ListChecks, MapPin, QrCode, Sparkles } from 'lucide-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getQuest(id: string, teamId: string) {
  try {
    await connectDB()
    const quest = await QuestCard.findOne({ _id: id, teamId }).lean<any>()
    if (!quest) return null
    const progress = await QuestProgress.findOne({ teamId, questCardId: id }).lean<any>()
    const labels = await resolveLocationLabels(
      (quest.steps ?? []).map((s: any) => ({
        locationType: s.locationType,
        locationId: s.locationId,
      })),
      teamId,
    )
    const completedOrders = new Set((progress?.completedSteps ?? []).map((s: any) => s.stepOrder))
    const stepsWithLabels = (quest.steps ?? []).map((s: any) => {
      const label = labels.get(`${s.locationType}:${s.locationId.toString()}`)
      return {
        ...s,
        locationName: label?.name ?? null,
        locationPath: label?.path ?? null,
        done: completedOrders.has(s.order),
      }
    })
    return JSON.parse(JSON.stringify({
      ...quest,
      steps: stepsWithLabels,
      completedCount: completedOrders.size,
      completedAt: progress?.completedAt ?? null,
    }))
  } catch { return null }
}

export default async function AdminQuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const access = await requireTeamPageAccess('manager', '/admin/quests')
  const quest = await getQuest(id, access.teamId)
  if (!quest) return <div className="p-8 text-[var(--status-danger)]">Quest not found</div>

  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const qrUrl = `${appUrl}/quest/${quest.qrToken}`
  const questTypeLabel = quest.type === 'location_chain' ? 'Location Chain' : 'Custom'
  const cardLabel = quest.batchSize > 1
    ? `${questTypeLabel} · Card ${quest.cardNumber} of ${quest.batchSize}`
    : questTypeLabel
  const steps = [...(quest.steps ?? [])].sort((a: any, b: any) => a.order - b.order)

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Link
          href="/admin/quests"
          className="inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to quests
        </Link>

        <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start">
          <Card className="overflow-hidden bg-white" data-qr-export-card="true">
            <CardContent className="p-5 sm:p-6">
              <div className="mx-auto w-full max-w-[17.625rem]">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-neutral-900 text-white shadow-sm">
                    <QrCode className="size-5" />
                  </div>
                  <div className="min-w-0">
                    {/* This card is data-qr-export-card: hardcoded bg-white so
                        a printed/exported QR sheet stays legible regardless
                        of app theme. Its own text must be equally fixed —
                        text-foreground/text-muted flip to near-white in dark
                        mode and were rendering illegibly on this permanently
                        light card. */}
                    <p className="text-base font-semibold text-neutral-900">Quest Card QR</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-neutral-500">
                      <Sparkles className="size-3.5 shrink-0" />
                      Give this to participants
                    </p>
                  </div>
                </div>
                <div className="flex justify-center">
                  <QRCodeDisplay
                    url={qrUrl}
                    label={quest.title}
                    sublabel={cardLabel}
                    description={quest.description}
                    exportTitle="Quest Card QR"
                    exportDescription="Give this to participants"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardContent className="p-5 sm:p-6">
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-foreground text-background shadow-sm">
                      <ListChecks className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-base font-semibold text-foreground">Steps ({steps.length})</p>
                        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          {cardLabel}
                        </span>
                        {quest.completedAt ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-foreground/40 px-2 py-0.5 text-xs font-semibold text-foreground">
                            <CheckCircle2 className="size-3" />
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {quest.completedCount}/{steps.length} done
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <MapPin className="size-3.5 shrink-0" />
                        {quest.title}
                      </p>
                      {quest.description && (
                        <p className="mt-1 text-sm text-muted-foreground">{quest.description}</p>
                      )}
                    </div>
                  </div>
                  <ReissueQuestCardButton questId={quest._id} />
                </div>

                <ol className="space-y-2.5">
                  {steps.map((step: any) => (
                    <li
                      key={step.order}
                      className={`flex items-start gap-3 rounded-xl px-3 py-2.5 ${step.done ? 'bg-muted' : ''}`}
                    >
                      <span
                        className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                          step.done ? 'bg-foreground text-background' : 'border border-foreground/40 text-foreground'
                        }`}
                      >
                        {step.done ? <CheckCircle2 className="size-4" /> : step.order + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground" title={step.locationPath ?? undefined}>
                          {step.locationName ?? <span className="text-muted-foreground italic">Unknown location</span>}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {step.locationType}{step.locationPath && step.locationPath !== step.locationName ? ` · ${step.locationPath}` : ''}
                        </p>
                        {step.challenge && <p className="mt-0.5 text-xs text-muted-foreground italic">{step.challenge}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}

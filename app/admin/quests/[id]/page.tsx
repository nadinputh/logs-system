import QRCodeDisplay from '@/components/admin/QRCodeDisplay'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { connectDB } from '@/lib/db'
import { QuestCard } from '@/lib/models/QuestCard'
import { resolveLocationLabels } from '@/lib/locationLabels'
import { requireTeamPageAccess } from '@/lib/server/requireTeamPageAccess'
import { ArrowLeft, ListChecks, MapPin, QrCode, Sparkles } from 'lucide-react'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getQuest(id: string, teamId: string) {
  try {
    await connectDB()
    const quest = await QuestCard.findOne({ _id: id, teamId }).lean<any>()
    if (!quest) return null
    const labels = await resolveLocationLabels(
      (quest.steps ?? []).map((s: any) => ({
        locationType: s.locationType,
        locationId: s.locationId,
      })),
      teamId,
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
  const access = await requireTeamPageAccess('manager', '/admin/quests')
  const quest = await getQuest(id, access.teamId)
  if (!quest) return <div className="p-8 text-red-500">Quest not found</div>

  const appUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
  const qrUrl = `${appUrl}/quest/${quest.qrToken}`
  const questTypeLabel = quest.type === 'location_chain' ? 'Location Chain' : 'Custom'
  const steps = [...(quest.steps ?? [])].sort((a: any, b: any) => a.order - b.order)

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-4 sm:p-6 lg:p-8">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Link
          href="/admin/quests"
          className="inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to quests
        </Link>

        <div className="grid gap-4 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start">
          <Card className="overflow-hidden bg-white" data-qr-export-card="true">
            <CardContent className="p-5 sm:p-6">
              <div className="mx-auto w-full max-w-[17.625rem]">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl gradient-primary text-white shadow-sm shadow-cyan-200">
                    <QrCode className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-foreground">Quest Card QR</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Sparkles className="size-3.5 shrink-0" />
                      Give this to participants
                    </p>
                  </div>
                </div>
                <div className="flex justify-center">
                  <QRCodeDisplay
                    url={qrUrl}
                    label={quest.title}
                    sublabel={questTypeLabel}
                    exportTitle="Quest Card QR"
                    exportDescription="Give this to participants"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden bg-white">
            <CardContent className="p-5 sm:p-6">
              <div className="mb-5 flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl gradient-primary text-white shadow-sm shadow-cyan-200">
                  <ListChecks className="size-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-foreground">Steps ({steps.length})</p>
                    <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-600">
                      {questTypeLabel}
                    </span>
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

              <ol className="space-y-2.5">
                {steps.map((step: any) => (
                  <li key={step.order} className="flex items-start gap-3 rounded-xl bg-muted/40 px-3 py-2.5">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-xs font-bold text-cyan-700">
                      {step.order + 1}
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

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from '@/components/ui/sonner'
import { fetchJsonOnce } from '@/lib/clientFetch'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'

interface QuestCard {
  _id: string
  title: string
  description?: string
  type: string
  qrToken: string
  isActive: boolean
  steps: any[]
  cardNumber: number
  batchSize: number
  completedCount: number
  completedAt?: string | null
}
interface Building { _id: string; name: string }
interface Floor { _id: string; name: string; number: number }
interface Room { _id: string; name: string; number: string; floorId: string }
interface Step { order: number; locationId: string; locationType: 'building' | 'floor' | 'room'; challenge?: string }

export default function AdminQuestsPage() {
  const t = useTranslations('adminQuests')
  const apiError = useApiError()
  const [quests, setQuests] = useState<QuestCard[]>([])
  const [buildings, setBuildings] = useState<Building[]>([])
  const [floors, setFloors] = useState<Floor[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<'location_chain' | 'custom'>('location_chain')
  const [count, setCount] = useState('1')
  const [steps, setSteps] = useState<Step[]>([{ order: 0, locationId: '', locationType: 'room' }])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      fetchJsonOnce<QuestCard[]>('/api/quests'),
      fetchJsonOnce<Building[]>('/api/buildings'),
      fetchJsonOnce<Floor[]>('/api/floors'),
      fetchJsonOnce<Room[]>('/api/rooms'),
    ]).then(([nextQuests, nextBuildings, nextFloors, nextRooms]) => {
      setQuests(nextQuests)
      setBuildings(nextBuildings)
      setFloors(nextFloors)
      setRooms(nextRooms)
    }).finally(() => setLoading(false))
  }, [])

  const filtered = quests.filter(q => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return (
      q.title.toLowerCase().includes(query) ||
      String(q.cardNumber).includes(query) ||
      (q.description ?? '').toLowerCase().includes(query)
    )
  })

  function addStep() {
    setSteps(s => [...s, { order: s.length, locationId: '', locationType: 'room' }])
  }

  function updateStep(idx: number, field: keyof Step, value: any) {
    setSteps(s => s.map((step, i) => i === idx ? { ...step, [field]: value } : step))
  }

  function removeStep(idx: number) {
    setSteps(s => s.filter((_, i) => i !== idx).map((step, i) => ({ ...step, order: i })))
  }

  const getLocationOptions = (locType: string) => {
    if (locType === 'building') return buildings.map(b => ({ id: b._id, label: b.name }))
    if (locType === 'floor') return floors.map(f => ({ id: f._id, label: t('floorOption', { number: f.number, name: f.name }) }))
    return rooms.map(r => ({ id: r._id, label: `${r.number} · ${r.name}` }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (steps.some(s => !s.locationId)) { toast.error(t('allStepsNeedALocation')); return }
    setSaving(true)
    try {
      const res = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, type, steps, count: parseInt(count) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(data, t('failedToCreateQuest')))
      toast.success(t('cardsCreated', { count }))
      setOpen(false)
      setTitle(''); setDescription(''); setCount('1')
      setSteps([{ order: 0, locationId: '', locationType: 'room' }])
      fetch('/api/quests').then(r => r.json()).then(setQuests)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToCreateQuest'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('questCards')}</h1>
          {loading ? (
            <Skeleton className="mt-1.5 h-4 w-28" />
          ) : (
            <p className="text-sm text-muted mt-0.5">{t('issued', { count: quests.length })}</p>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={
            <Button />
          }>
            <Plus className="w-4 h-4" aria-hidden />
            {t('issueQuest')}
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t('issueQuestCards')}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1"><Label>{t('title')}</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
              <div className="space-y-1"><Label>{t('descriptionOptional')}</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('questType')}</Label>
                  <Select
                    value={type}
                    onValueChange={(v) => setType((v ?? 'location_chain') as any)}
                    items={{ location_chain: t('locationChain'), custom: t('custom') }}
                    required
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="location_chain">{t('locationChain')}</SelectItem>
                      <SelectItem value="custom">{t('custom')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>{t('numberOfCards')}</Label><Input type="number" min="1" max="200" value={count} onChange={e => setCount(e.target.value)} required /></div>
              </div>

              <div className="space-y-2">
                <Label>{t('steps')}</Label>
                {steps.map((step, idx) => (
                  <div key={idx} className="border border-border/60 rounded-xl p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">{t('stepN', { n: idx + 1 })}</span>
                      {steps.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(idx)}>{t('remove')}</Button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={step.locationType}
                        onValueChange={v => updateStep(idx, 'locationType', v ?? 'room')}
                        items={{ building: t('building'), floor: t('floor'), room: t('room') }}
                        required
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="building">{t('building')}</SelectItem>
                          <SelectItem value="floor">{t('floor')}</SelectItem>
                          <SelectItem value="room">{t('room')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={step.locationId}
                        onValueChange={v => updateStep(idx, 'locationId', v ?? '')}
                        items={Object.fromEntries(getLocationOptions(step.locationType).map(o => [o.id, o.label]))}
                        required
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder={t('selectLocation')} /></SelectTrigger>
                        <SelectContent>
                          {getLocationOptions(step.locationType).map(opt => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      placeholder={t('challengeOptional')}
                      value={step.challenge ?? ''}
                      onChange={e => updateStep(idx, 'challenge', e.target.value)}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addStep}>+ Add Step</Button>
              </div>

              <Button type="submit" variant="mono" className="w-full" disabled={saving}>{saving ? t('creating') : t('createCards', { count })}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search — the only way to find one card among an identically-titled
          bulk batch without opening each row, e.g. when a guest reports
          losing theirs. */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/60" aria-hidden />
        <Input
          placeholder={t('searchByTitleUseCase')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div>
        {loading ? (
          <Table aria-label={t('questCardsLoadingTable')}>
            <TableHeader>
              <TableHead isRowHeader>{t('title')}</TableHead>
              <TableHead>{t('card')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('type')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('progress')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-44" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-28 rounded-full" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="text-right">
                    <Skeleton className="ml-auto h-8 w-16" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : quests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Sparkles className="w-6 h-6 text-foreground" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">{t('noQuestsYet')}</p>
            <p className="text-xs text-muted mt-1">{t('issueAQuestToGet')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Search className="w-6 h-6 text-foreground" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">{t('noMatchingQuestCards')}</p>
            <p className="text-xs text-muted mt-1">{t('tryADifferentSearchTerm')}</p>
          </div>
        ) : (
          <Table aria-label={t('questCardsTable')}>
            <TableHeader>
              <TableHead isRowHeader>{t('title')}</TableHead>
              <TableHead>{t('card')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('type')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('progress')}</TableHead>
              <TableHead>{t('status')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
            </TableHeader>
            <TableBody>
              {filtered.map(q => (
                <TableRow key={q._id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Sparkles className="w-4 h-4 text-foreground" aria-hidden />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">{q.title}</p>
                        {q.description && <p className="text-xs text-muted mt-0.5 truncate max-w-[200px]">{q.description}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted">{q.batchSize > 1 ? t('cardOf', { n: q.cardNumber, total: q.batchSize }) : '—'}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full text-foreground bg-muted">
                      {q.type === 'location_chain' ? t('locationChain') : t('custom')}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted">
                      {q.completedAt ? t('completed') : t('doneOf', { done: q.completedCount, total: q.steps.length })}
                    </span>
                  </TableCell>
                  <TableCell>
                    {q.isActive ? (
                      // Outlined, not solid-filled — see the matching note on
                      // the Logs page's "In" pill. A quest's active/inactive
                      // state is a stable configuration flag, not a live
                      // signal, so unlike "In" this dot doesn't pulse.
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground border border-foreground/40 px-2.5 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-foreground rounded-full" />
                        {t('active')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs font-medium text-muted bg-muted px-2.5 py-0.5 rounded-full">{t('inactive')}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/quests/${q._id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                    >{t('view')}</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
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

interface QuestCard { _id: string; title: string; type: string; qrToken: string; isActive: boolean; steps: any[] }
interface Building { _id: string; name: string }
interface Floor { _id: string; name: string; number: number }
interface Room { _id: string; name: string; number: string; floorId: string }
interface Step { order: number; locationId: string; locationType: 'building' | 'floor' | 'room'; challenge?: string }

export default function AdminQuestsPage() {
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
    if (locType === 'floor') return floors.map(f => ({ id: f._id, label: `Floor ${f.number} · ${f.name}` }))
    return rooms.map(r => ({ id: r._id, label: `${r.number} · ${r.name}` }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (steps.some(s => !s.locationId)) { toast.error('All steps need a location'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, type, steps, count: parseInt(count) }),
      })
      if (!res.ok) throw new Error()
      toast.success(`${count} quest card(s) created`)
      setOpen(false)
      setTitle(''); setDescription(''); setCount('1')
      setSteps([{ order: 0, locationId: '', locationType: 'room' }])
      fetch('/api/quests').then(r => r.json()).then(setQuests)
    } catch {
      toast.error('Failed to create quest')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Quest Cards</h1>
          {loading ? (
            <Skeleton className="mt-1.5 h-4 w-28" />
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">{quests.length} quest{quests.length !== 1 ? 's' : ''} issued</p>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={
            <Button />
          }>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Issue Quest
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Issue Quest Cards</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1"><Label>Title</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
              <div className="space-y-1"><Label>Description (optional)</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Quest Type</Label>
                  <Select
                    value={type}
                    onValueChange={(v) => setType((v ?? 'location_chain') as any)}
                    items={{ location_chain: 'Location Chain', custom: 'Custom' }}
                    required
                  >
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="location_chain">Location Chain</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>Number of Cards</Label><Input type="number" min="1" max="200" value={count} onChange={e => setCount(e.target.value)} required /></div>
              </div>

              <div className="space-y-2">
                <Label>Steps</Label>
                {steps.map((step, idx) => (
                  <div key={idx} className="border border-border/60 rounded-xl p-3 space-y-2 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">Step {idx + 1}</span>
                      {steps.length > 1 && <Button type="button" variant="ghost" size="sm" onClick={() => removeStep(idx)}>Remove</Button>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select
                        value={step.locationType}
                        onValueChange={v => updateStep(idx, 'locationType', v ?? 'room')}
                        items={{ building: 'Building', floor: 'Floor', room: 'Room' }}
                        required
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="building">Building</SelectItem>
                          <SelectItem value="floor">Floor</SelectItem>
                          <SelectItem value="room">Room</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={step.locationId}
                        onValueChange={v => updateStep(idx, 'locationId', v ?? '')}
                        items={Object.fromEntries(getLocationOptions(step.locationType).map(o => [o.id, o.label]))}
                        required
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select location" /></SelectTrigger>
                        <SelectContent>
                          {getLocationOptions(step.locationType).map(opt => (
                            <SelectItem key={opt.id} value={opt.id}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input
                      placeholder="Challenge (optional)"
                      value={step.challenge ?? ''}
                      onChange={e => updateStep(idx, 'challenge', e.target.value)}
                    />
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addStep}>+ Add Step</Button>
              </div>

              <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Creating…' : `Create ${count} Card(s)`}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div>
        {loading ? (
          <Table aria-label="Quest cards loading table">
            <TableHeader>
              <TableHead isRowHeader>Title</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead className="hidden md:table-cell">Steps</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <Skeleton className="h-4 w-40" />
                    </div>
                  </TableCell>
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
            <div className="w-12 h-12 rounded-2xl bg-sky-500/10 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <p className="font-medium text-foreground text-sm">No quests yet</p>
            <p className="text-xs text-muted-foreground mt-1">Issue a quest to get started</p>
          </div>
        ) : (
          <Table aria-label="Quest cards table">
            <TableHeader>
              <TableHead isRowHeader>Title</TableHead>
              <TableHead className="hidden sm:table-cell">Type</TableHead>
              <TableHead className="hidden md:table-cell">Steps</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableHeader>
            <TableBody>
              {quests.map(q => (
                <TableRow key={q._id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                        <svg className="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </div>
                      <p className="font-semibold text-sm text-foreground">{q.title}</p>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full text-sky-500 bg-sky-500/10">
                      {q.type === 'location_chain' ? 'Location Chain' : 'Custom'}
                    </span>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-sm text-muted-foreground">{q.steps.length} step{q.steps.length !== 1 ? 's' : ''}</span>
                  </TableCell>
                  <TableCell>
                    {q.isActive ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-xs font-medium text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">Inactive</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/quests/${q._id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                    >View</Link>
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

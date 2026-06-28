'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import CheckInModeToggle from '@/components/admin/CheckInModeToggle'
import { toast } from '@/components/ui/sonner'
import { fetchJsonOnce } from '@/lib/clientFetch'

interface Building { _id: string; name: string }
interface Floor { _id: string; name: string; number: number; buildingId: string | Building; checkInMode?: 'click' | 'passkey' }

function FloorsContent() {
  const searchParams = useSearchParams()
  const buildingFilter = searchParams.get('buildingId')

  const [buildings, setBuildings] = useState<Building[]>([])
  const [floors, setFloors] = useState<Floor[]>([])
  const [open, setOpen] = useState(false)
  const [buildingId, setBuildingId] = useState(buildingFilter ?? '')
  const [number, setNumber] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchJsonOnce<Building[]>('/api/buildings'),
      fetchJsonOnce<Floor[]>('/api/floors'),
    ]).then(([nextBuildings, nextFloors]) => {
      setBuildings(nextBuildings)
      setFloors(nextFloors)
    }).finally(() => setLoading(false))
  }, [])

  const filtered = buildingFilter ? floors.filter(f => {
    const bId = typeof f.buildingId === 'object' ? (f.buildingId as Building)._id : f.buildingId
    return bId === buildingFilter
  }) : floors

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/floors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId, number: parseInt(number), name, description }),
      })
      if (!res.ok) throw new Error()
      toast.success('Floor created')
      setOpen(false)
      setName(''); setNumber(''); setDescription('')
      fetch('/api/floors').then(r => r.json()).then(setFloors)
    } catch {
      toast.error('Failed to create floor')
    } finally {
      setSaving(false)
    }
  }

  const getBuildingName = (bId: string | Building) => {
    if (typeof bId === 'object') return bId.name
    return buildings.find(b => b._id === bId)?.name ?? bId
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Floors</h1>
          {loading ? (
            <Skeleton className="mt-1.5 h-4 w-28" />
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">
              {filtered.length} floor{filtered.length !== 1 ? 's' : ''}
              {buildingFilter && buildings.length > 0 && ` in ${getBuildingName(buildingFilter)}`}
            </p>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={
            <Button />
          }>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Floor
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Floor</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Building</Label>
                <Select
                  value={buildingId}
                  onValueChange={v => setBuildingId(v ?? '')}
                  items={Object.fromEntries(buildings.map(b => [b._id, b.name]))}
                  required
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select building" /></SelectTrigger>
                  <SelectContent>
                    {buildings.map(b => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Floor Number</Label>
                  <Input type="number" value={number} onChange={e => setNumber(e.target.value)} required placeholder="1" />
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Ground Floor" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief description…" />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Creating…' : 'Create Floor'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div>
        {loading ? (
          <Table aria-label="Floors loading table">
            <TableHeader>
              <TableHead isRowHeader>Floor</TableHead>
              <TableHead className="hidden sm:table-cell">Building</TableHead>
              <TableHead className="hidden md:table-cell">Check-in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 4 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-8 w-8 rounded-lg" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-40 sm:hidden" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-40" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-8 w-36 rounded-full" /></TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Skeleton className="h-8 w-14" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </div>
            <p className="font-medium text-foreground text-sm">No floors yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a floor to begin organising rooms</p>
          </div>
        ) : (
          <Table aria-label="Floors table">
            <TableHeader>
              <TableHead isRowHeader>Floor</TableHead>
              <TableHead className="hidden sm:table-cell">Building</TableHead>
              <TableHead className="hidden md:table-cell">Check-in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableHeader>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f._id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center shrink-0 text-xs font-bold text-cyan-500">
                        {f.number}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">{f.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 sm:hidden">{getBuildingName(f.buildingId)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <p className="text-sm text-muted-foreground">{getBuildingName(f.buildingId)}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <CheckInModeToggle locationId={f._id} value={f.checkInMode ?? 'click'} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/qr/${f._id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        QR
                      </Link>
                      <Link
                        href={`/admin/rooms?floorId=${f._id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                        Rooms
                      </Link>
                    </div>
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

export default function AdminFloorsPage() {
  return <Suspense><FloorsContent /></Suspense>
}

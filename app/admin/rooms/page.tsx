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
interface Floor { _id: string; name: string; number: number; buildingId: string }
interface Room { _id: string; name: string; number: string; type?: string; floorId: string; buildingId: string; checkInMode?: 'click' | 'passkey' }

function RoomsContent() {
  const searchParams = useSearchParams()
  const floorFilter = searchParams.get('floorId')

  const [buildings, setBuildings] = useState<Building[]>([])
  const [floors, setFloors] = useState<Floor[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [open, setOpen] = useState(false)
  const [buildingId, setBuildingId] = useState('')
  const [floorId, setFloorId] = useState(floorFilter ?? '')
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [type, setType] = useState('')
  const [capacity, setCapacity] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetchJsonOnce<Building[]>('/api/buildings'),
      fetchJsonOnce<Floor[]>('/api/floors'),
      fetchJsonOnce<Room[]>('/api/rooms'),
    ]).then(([b, f, r]) => { setBuildings(b); setFloors(f); setRooms(r) }).finally(() => setLoading(false))
  }, [])

  const availableFloors = buildingId ? floors.filter(f => f.buildingId === buildingId) : floors
  const filtered = floorFilter ? rooms.filter(r => r.floorId === floorFilter) : rooms

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorId, buildingId, name, number,
          type: type || undefined,
          capacity: capacity ? parseInt(capacity) : undefined,
          description: description || undefined,
        }),
      })
      if (!res.ok) throw new Error()
      toast.success('Room created')
      setOpen(false)
      setName(''); setNumber(''); setType(''); setCapacity(''); setDescription('')
      fetch('/api/rooms').then(r => r.json()).then(setRooms)
    } catch {
      toast.error('Failed to create room')
    } finally {
      setSaving(false)
    }
  }

  const getFloorName = (fId: string) => {
    const f = floors.find(fl => fl._id === fId)
    return f ? `Floor ${f.number} · ${f.name}` : fId
  }

  const typeColors: Record<string, string> = {
    office: 'text-blue-600 bg-blue-50',
    lab: 'text-emerald-600 bg-emerald-50',
    meeting: 'text-cyan-600 bg-cyan-50',
    storage: 'text-amber-600 bg-amber-50',
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Rooms</h1>
          {loading ? (
            <Skeleton className="mt-1.5 h-4 w-24" />
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">{filtered.length} room{filtered.length !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={
            <Button />
          }>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Room
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Room</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Building</Label>
                <Select
                  value={buildingId}
                  onValueChange={v => { setBuildingId(v ?? ''); setFloorId('') }}
                  items={Object.fromEntries(buildings.map(b => [b._id, b.name]))}
                  required
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select building" /></SelectTrigger>
                  <SelectContent>{buildings.map(b => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Floor</Label>
                <Select
                  value={floorId}
                  onValueChange={v => setFloorId(v ?? '')}
                  items={Object.fromEntries(availableFloors.map(f => [f._id, `Floor ${f.number} · ${f.name}`]))}
                  required
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select floor" /></SelectTrigger>
                  <SelectContent>{availableFloors.map(f => <SelectItem key={f._id} value={f._id}>Floor {f.number} · {f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} required placeholder="Conference A" /></div>
                <div className="space-y-1.5"><Label>Number</Label><Input value={number} onChange={e => setNumber(e.target.value)} required placeholder="101" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Type (optional)</Label><Input value={type} onChange={e => setType(e.target.value)} placeholder="Office, Lab…" /></div>
                <div className="space-y-1.5"><Label>Capacity (optional)</Label><Input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="20" /></div>
              </div>
              <div className="space-y-1.5"><Label>Description (optional)</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} /></div>
              <Button type="submit" className="w-full" disabled={saving}>{saving ? 'Creating…' : 'Create Room'}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div>
        {loading ? (
          <Table aria-label="Rooms loading table">
            <TableHeader>
              <TableHead isRowHeader>Room</TableHead>
              <TableHead className="hidden sm:table-cell">Floor</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead className="hidden lg:table-cell">Check-in</TableHead>
              <TableHead className="text-right">QR</TableHead>
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
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-44" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="hidden lg:table-cell"><Skeleton className="h-8 w-36 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-14" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
            <p className="font-medium text-foreground text-sm">No rooms yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a room to enable QR-based check-ins</p>
          </div>
        ) : (
          <Table aria-label="Rooms table">
            <TableHeader>
              <TableHead isRowHeader>Room</TableHead>
              <TableHead className="hidden sm:table-cell">Floor</TableHead>
              <TableHead className="hidden md:table-cell">Type</TableHead>
              <TableHead className="hidden lg:table-cell">Check-in</TableHead>
              <TableHead className="text-right">QR</TableHead>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const typeKey = r.type?.toLowerCase() ?? ''
                const badgeColor = typeColors[typeKey] ?? 'text-muted-foreground bg-muted'
                return (
                  <TableRow key={r._id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-muted-foreground">{r.number}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-sm text-foreground">{r.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 sm:hidden">{getFloorName(r.floorId)}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <p className="text-sm text-muted-foreground">{getFloorName(r.floorId)}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {r.type ? (
                        <span className={`inline-flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${badgeColor}`}>
                          {r.type}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <CheckInModeToggle locationId={r._id} value={r.checkInMode ?? 'click'} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/qr/${r._id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                        QR
                      </Link>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}

export default function AdminRoomsPage() {
  return <Suspense><RoomsContent /></Suspense>
}

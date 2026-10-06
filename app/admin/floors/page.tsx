'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, DoorOpen, Layers3, Pencil, Plus, QrCode, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import AccessSummary from '@/components/admin/AccessSummary'
import { toast } from '@/components/ui/sonner'
import { fetchJsonOnce } from '@/lib/clientFetch'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'

interface Building { _id: string; name: string }
interface Floor { _id: string; name: string; number: number; buildingId: string | Building; description?: string; checkInMode?: 'click' | 'passkey'; requireDynamicQr?: boolean }

function FloorsContent() {
  const t = useTranslations('adminFloors')
  const tCommon = useTranslations('common')
  const apiError = useApiError()
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
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState<Floor | null>(null)
  const [editNumber, setEditNumber] = useState('')
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  function reloadFloors() {
    return fetch('/api/floors').then(r => r.json()).then(setFloors)
  }

  useEffect(() => {
    Promise.all([
      fetchJsonOnce<Building[]>('/api/buildings'),
      fetchJsonOnce<Floor[]>('/api/floors'),
    ]).then(([nextBuildings, nextFloors]) => {
      setBuildings(nextBuildings)
      setFloors(nextFloors)
    }).finally(() => setLoading(false))
  }, [])

  const scoped = buildingFilter ? floors.filter(f => {
    const bId = typeof f.buildingId === 'object' ? (f.buildingId as Building)._id : f.buildingId
    return bId === buildingFilter
  }) : floors

  const filtered = scoped.filter(f => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return f.name.toLowerCase().includes(q) || String(f.number).includes(q)
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/floors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId, number: parseInt(number), name, description }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(data, t('failedToCreateFloor')))
      toast.success(t('floorCreated'))
      setOpen(false)
      setName(''); setNumber(''); setDescription('')
      reloadFloors()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToCreateFloor'))
    } finally {
      setSaving(false)
    }
  }

  function openEdit(f: Floor) {
    setEditing(f)
    setEditNumber(String(f.number))
    setEditName(f.name)
    setEditDescription(f.description ?? '')
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/locations/${editing._id}?type=floor`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: parseInt(editNumber), name: editName, description: editDescription }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(data, t('failedToUpdateFloor')))
      toast.success(t('floorUpdated'))
      setEditing(null)
      reloadFloors()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToUpdateFloor'))
    } finally {
      setEditSaving(false)
    }
  }

  const getBuildingName = (bId: string | Building) => {
    if (typeof bId === 'object') return bId.name
    return buildings.find(b => b._id === bId)?.name ?? bId
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* Breadcrumb back to the building this view is filtered to */}
      {buildingFilter && (
        <Link
          href="/admin/buildings"
          className="inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          {t('backToBuildings')}
        </Link>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('floors')}</h1>
          {loading ? (
            <Skeleton className="mt-1.5 h-4 w-28" />
          ) : (
            <p className="text-sm text-muted mt-0.5">
              {t('count', { count: scoped.length })}
              {buildingFilter && buildings.length > 0 && ` in ${getBuildingName(buildingFilter)}`}
            </p>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={
            <Button />
          }>
            <Plus className="w-4 h-4" aria-hidden />
            {t('addFloor')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t('newFloor')}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>{t('building')}</Label>
                <Select
                  value={buildingId}
                  onValueChange={v => setBuildingId(v ?? '')}
                  items={Object.fromEntries(buildings.map(b => [b._id, b.name]))}
                  required
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder={t('selectBuilding')} /></SelectTrigger>
                  <SelectContent>
                    {buildings.map(b => <SelectItem key={b._id} value={b._id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>{t('floorNumber')}</Label>
                  <Input type="number" value={number} onChange={e => setNumber(e.target.value)} required placeholder="1" />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('name')}</Label>
                  <Input value={name} onChange={e => setName(e.target.value)} required placeholder={t('groundFloor')} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('descriptionOptional')}</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={t('briefDescription')} />
              </div>
              <Button type="submit" variant="mono" className="w-full" disabled={saving}>{saving ? t('creating') : t('createFloor')}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o: boolean) => { if (!o) setEditing(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('editFloor')}</DialogTitle></DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('floorNumber')}</Label>
                <Input type="number" value={editNumber} onChange={e => setEditNumber(e.target.value)} required placeholder="1" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('name')}</Label>
                <Input value={editName} onChange={e => setEditName(e.target.value)} required placeholder={t('groundFloor')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('descriptionOptional')}</Label>
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2} placeholder={t('briefDescription')} />
            </div>
            <Button type="submit" variant="mono" className="w-full" disabled={editSaving}>{editSaving ? t('saving') : t('saveChanges')}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/60" aria-hidden />
        <Input
          placeholder={t('searchByNameOrNumber')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div>
        {loading ? (
          <Table aria-label={t('floorsLoadingTable')}>
            <TableHeader>
              <TableHead isRowHeader>{t('floor')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('building')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
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
        ) : scoped.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Layers3 className="w-6 h-6 text-foreground" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">{t('noFloorsYet')}</p>
            <p className="text-xs text-muted mt-1">{t('addAFloorToBegin')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Search className="w-6 h-6 text-foreground" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">{t('noMatchingFloors')}</p>
            <p className="text-xs text-muted mt-1">{t('tryADifferentSearchTerm')}</p>
          </div>
        ) : (
          <Table aria-label={t('floorsTable')}>
            <TableHeader>
              <TableHead isRowHeader>{t('floor')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('building')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
            </TableHeader>
            <TableBody>
              {filtered.map(f => (
                <TableRow key={f._id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 text-xs font-bold text-foreground">
                        {f.number}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">{f.name}</p>
                          <AccessSummary checkInMode={f.checkInMode} requireDynamicQr={f.requireDynamicQr} />
                        <p className="text-xs text-muted mt-0.5 sm:hidden">{getBuildingName(f.buildingId)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <p className="text-sm text-muted">{getBuildingName(f.buildingId)}</p>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(f)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted bg-muted/40 hover:bg-muted/60 hover:text-foreground px-3 py-1.5 rounded-lg transition-colors"
                        title={t('editFloor2')}
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                        {tCommon('edit')}
                      </button>
                      <Link
                        href={`/admin/qr/${f._id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" aria-hidden />
                        {tCommon('access')}
                      </Link>
                      <Link
                        href={`/admin/rooms?floorId=${f._id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <DoorOpen className="w-3.5 h-3.5" aria-hidden />
                        {t('roomsBtn')}
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

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Building2, Layers3, MapPinned, Pencil, Plus, QrCode, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import CheckInModeToggle from '@/components/admin/CheckInModeToggle'
import DynamicQrToggle from '@/components/admin/DynamicQrToggle'
import { toast } from '@/components/ui/sonner'
import { fetchJsonOnce } from '@/lib/clientFetch'
import type { LatLng } from '@/components/admin/GeofenceMapPicker'
import { useTranslations } from 'next-intl'
import { useApiError } from '@/lib/useApiError'

// Leaflet touches window/document at import time — must stay client-only,
// mirroring the QRScanner/html5-qrcode convention noted in CLAUDE.md.
const GeofenceMapPicker = dynamic(() => import('@/components/admin/GeofenceMapPicker'), { ssr: false })

type GeofencePolygon = { type: 'Polygon'; coordinates: number[][][] }
interface Building { _id: string; name: string; address: string; description?: string; checkInMode?: 'click' | 'passkey'; requireDynamicQr?: boolean; geofence?: GeofencePolygon | null }

const DEFAULT_MAP_CENTER: LatLng = [11.5564, 104.9282] // arbitrary fallback so the map always has somewhere to open

// GeoJSON is [lng, lat] and requires a closed ring (first point repeated at
// the end) — both the opposite of what's natural to hand-draw on a map.
function verticesToGeofence(vertices: LatLng[]): GeofencePolygon | null {
  if (vertices.length < 3) return null
  const ring = vertices.map(([lat, lng]) => [lng, lat])
  const [firstLng, firstLat] = ring[0]
  const [lastLng, lastLat] = ring[ring.length - 1]
  if (firstLng !== lastLng || firstLat !== lastLat) ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

function geofenceToVertices(geofence?: GeofencePolygon | null): LatLng[] {
  const ring = geofence?.coordinates?.[0]
  if (!ring || ring.length < 3) return []
  // Drop the closing duplicate — editing should show each vertex once.
  const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring
  return open.map(([lng, lat]) => [lat, lng] as LatLng)
}

export default function AdminBuildingsPage() {
  const t = useTranslations('adminBuildings')
  const tGeo = useTranslations('geofence')
  const tCommon = useTranslations('common')
  const apiError = useApiError()
  const [buildings, setBuildings] = useState<Building[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [geofenceVertices, setGeofenceVertices] = useState<LatLng[]>([])
  const [showGeofence, setShowGeofence] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState<Building | null>(null)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editGeofenceVertices, setEditGeofenceVertices] = useState<LatLng[]>([])
  const [editShowGeofence, setEditShowGeofence] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setBuildings(await fetchJsonOnce<Building[]>('/api/buildings'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = buildings.filter(b => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q)
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/buildings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address, description, geofence: verticesToGeofence(geofenceVertices) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(data, t('failedToCreateBuilding')))
      toast.success(t('buildingCreated'))
      setOpen(false)
      setName(''); setAddress(''); setDescription(''); setGeofenceVertices([]); setShowGeofence(false)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToCreateBuilding'))
    } finally {
      setSaving(false)
    }
  }

  function openEdit(b: Building) {
    setEditing(b)
    setEditName(b.name)
    setEditAddress(b.address)
    setEditDescription(b.description ?? '')
    setEditGeofenceVertices(geofenceToVertices(b.geofence))
    setEditShowGeofence(!!b.geofence)
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    setEditSaving(true)
    try {
      const res = await fetch(`/api/locations/${editing._id}?type=building`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          address: editAddress,
          description: editDescription,
          geofence: verticesToGeofence(editGeofenceVertices),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(apiError(data, t('failedToUpdateBuilding')))
      toast.success(t('buildingUpdated'))
      setEditing(null)
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('failedToUpdateBuilding'))
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('buildings')}</h1>
          {loading ? (
            <Skeleton className="mt-1.5 h-4 w-32" />
          ) : (
            <p className="text-sm text-muted mt-0.5">{t('registered', { count: buildings.length })}</p>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={
            <Button />
          }>
            <Plus className="w-4 h-4" aria-hidden />
            {t('addBuilding')}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('newBuilding')}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>{t('name')}</Label>
                <Input value={name} onChange={e => setName(e.target.value)} required placeholder={t('headquarters')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('address')}</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} required placeholder={t('k123MainSt')} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('descriptionOptional')}</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={t('briefDescription')} />
              </div>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setShowGeofence(v => !v)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent transition-colors"
                >
                  <MapPinned className="w-4 h-4" aria-hidden />
                  {tGeo('boundary')}
                </button>
                {showGeofence && (
                  <GeofenceMapPicker value={geofenceVertices} onChange={setGeofenceVertices} center={DEFAULT_MAP_CENTER} />
                )}
              </div>
              <Button type="submit" variant="mono" className="w-full" disabled={saving}>
                {saving ? t('creating') : t('createBuilding')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o: boolean) => { if (!o) setEditing(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editBuilding')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{t('name')}</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} required placeholder={t('headquarters')} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('address')}</Label>
              <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} required placeholder={t('k123MainSt')} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('descriptionOptional')}</Label>
              <Textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={2} placeholder={t('briefDescription')} />
            </div>
            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setEditShowGeofence(v => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-accent transition-colors"
              >
                <MapPinned className="w-4 h-4" aria-hidden />
                {tGeo('boundary')}
              </button>
              {editShowGeofence && (
                <GeofenceMapPicker
                  value={editGeofenceVertices}
                  onChange={setEditGeofenceVertices}
                  center={editGeofenceVertices[0] ?? DEFAULT_MAP_CENTER}
                />
              )}
            </div>
            <Button type="submit" variant="mono" className="w-full" disabled={editSaving}>
              {editSaving ? t('saving') : t('saveChanges')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/60" aria-hidden />
        <Input
          placeholder={t('searchByNameOrAddress')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <div>
        {loading ? (
          <Table aria-label={t('buildingsLoadingTable')}>
            <TableHeader>
              <TableHead isRowHeader>{t('building')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('address')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('checkIn')}</TableHead>
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
                        <Skeleton className="h-3 w-48" />
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-44" /></TableCell>
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
        ) : buildings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Building2 className="w-6 h-6 text-foreground" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">{t('noBuildingsYet')}</p>
            <p className="text-xs text-muted mt-1">{t('clickAddBuildingToGet')}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Search className="w-6 h-6 text-foreground" strokeWidth={1.75} aria-hidden />
            </div>
            <p className="font-medium text-foreground text-sm">{t('noMatchingBuildings')}</p>
            <p className="text-xs text-muted mt-1">{t('tryADifferentSearchTerm')}</p>
          </div>
        ) : (
          <Table aria-label={t('buildingsTable')}>
            <TableHeader>
              <TableHead isRowHeader>{t('building')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('address')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('checkIn')}</TableHead>
              <TableHead className="text-right">{t('actions')}</TableHead>
            </TableHeader>
            <TableBody>
              {filtered.map(b => (
                <TableRow key={b._id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4 text-foreground" aria-hidden />
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">{b.name}</p>
                        {b.description && <p className="text-xs text-muted mt-0.5 truncate max-w-[200px]">{b.description}</p>}
                        <p className="text-xs text-muted mt-0.5 sm:hidden">{b.address}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <p className="text-sm text-muted">{b.address}</p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap items-center gap-2">
                        <CheckInModeToggle locationId={b._id} locationType="building" value={b.checkInMode ?? 'click'} />
                        <DynamicQrToggle locationId={b._id} locationType="building" value={!!b.requireDynamicQr} />
                      </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(b)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted bg-muted/40 hover:bg-muted/60 hover:text-foreground px-3 py-1.5 rounded-lg transition-colors"
                        title={t('editBuilding2')}
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                        {tCommon('edit')}
                      </button>
                      <Link
                        href={`/admin/qr/${b._id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" aria-hidden />
                        {t('qr')}
                      </Link>
                      <Link
                        href={`/admin/floors?buildingId=${b._id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Layers3 className="w-3.5 h-3.5" aria-hidden />
                        {t('floorsBtn')}
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

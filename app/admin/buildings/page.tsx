'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Layers3, Plus, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import CheckInModeToggle from '@/components/admin/CheckInModeToggle'
import { toast } from '@/components/ui/sonner'
import { fetchJsonOnce } from '@/lib/clientFetch'

interface Building { _id: string; name: string; address: string; description?: string; checkInMode?: 'click' | 'passkey' }

export default function AdminBuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    try {
      setBuildings(await fetchJsonOnce<Building[]>('/api/buildings'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/buildings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, address, description }),
      })
      if (!res.ok) throw new Error()
      toast.success('Building created')
      setOpen(false)
      setName(''); setAddress(''); setDescription('')
      load()
    } catch {
      toast.error('Failed to create building')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Buildings</h1>
          {loading ? (
            <Skeleton className="mt-1.5 h-4 w-32" />
          ) : (
            <p className="text-sm text-muted mt-0.5">{buildings.length} location{buildings.length !== 1 ? 's' : ''} registered</p>
          )}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={
            <Button />
          }>
            <Plus className="w-4 h-4" aria-hidden />
            Add Building
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Building</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} required placeholder="Headquarters" />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} required placeholder="123 Main St" />
              </div>
              <div className="space-y-1.5">
                <Label>Description (optional)</Label>
                <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief description…" />
              </div>
              <Button type="submit" variant="mono" className="w-full" disabled={saving}>
                {saving ? 'Creating…' : 'Create Building'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div>
        {loading ? (
          <Table aria-label="Buildings loading table">
            <TableHeader>
              <TableHead isRowHeader>Building</TableHead>
              <TableHead className="hidden sm:table-cell">Address</TableHead>
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
            <p className="font-medium text-foreground text-sm">No buildings yet</p>
            <p className="text-xs text-muted mt-1">Click "Add Building" to get started</p>
          </div>
        ) : (
          <Table aria-label="Buildings table">
            <TableHeader>
              <TableHead isRowHeader>Building</TableHead>
              <TableHead className="hidden sm:table-cell">Address</TableHead>
              <TableHead className="hidden md:table-cell">Check-in</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableHeader>
            <TableBody>
              {buildings.map(b => (
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
                    <CheckInModeToggle locationId={b._id} value={b.checkInMode ?? 'click'} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/qr/${b._id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <QrCode className="w-3.5 h-3.5" aria-hidden />
                        QR
                      </Link>
                      <Link
                        href={`/admin/floors?buildingId=${b._id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent bg-accent/10 hover:bg-accent/20 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <Layers3 className="w-3.5 h-3.5" aria-hidden />
                        Floors
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

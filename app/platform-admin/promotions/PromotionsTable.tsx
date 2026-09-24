'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectItem } from '@/components/ui/select'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { readApiError } from '@/lib/clientFetch'

type CouponRow = {
  _id: string
  code: string
  type: 'percent' | 'fixed'
  value: number
  appliesTo: string
  redemptionCount: number
  maxRedemptions: number | null
  expiresAt: string | null
  isActive: boolean
  isPublic: boolean
  stripeCouponId?: string
}

function discountText(c: Pick<CouponRow, 'type' | 'value'>) {
  return c.type === 'percent' ? `${c.value}% off` : `$${(c.value / 100).toFixed(2)} off`
}

export function PromotionsTable({ initialCoupons }: { initialCoupons: CouponRow[] }) {
  const [coupons, setCoupons] = useState(initialCoupons)
  const [createOpen, setCreateOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const [code, setCode] = useState('')
  const [type, setType] = useState<'percent' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [expiresAt, setExpiresAt] = useState('')

  function resetForm() {
    setCode('')
    setType('percent')
    setValue('')
    setIsPublic(false)
    setMaxRedemptions('')
    setExpiresAt('')
  }

  async function createCoupon() {
    if (!code.trim() || !value) {
      toast.error('A code and a value are required.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/platform-admin/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          type,
          value: Number(value),
          isPublic,
          maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
          expiresAt: expiresAt || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not create the coupon.'))

      setCoupons((current) => [payload.coupon, ...current])
      setCreateOpen(false)
      resetForm()
      const message = payload.syncNote ?? `Coupon ${payload.coupon.code} created`
      if (payload.syncNote) {
        toast.warning(message)
      } else {
        toast.success(message)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the coupon.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(coupon: CouponRow) {
    setBusy(true)
    try {
      const res = await fetch(`/api/platform-admin/promotions/${coupon._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !coupon.isActive }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not update the coupon.'))
      setCoupons((current) => current.map((c) => (c._id === coupon._id ? payload.coupon : c)))
      // Deferred to a separate macrotask, not just reordered before the state
      // update: HeroUI's toast queue wraps every add in
      // document.startViewTransition(), and firing that in the same tick as
      // ANY other DOM-mutating React update — reordering the two statements
      // doesn't avoid it, since React can still batch them into one flush —
      // throws a benign "InvalidStateError" in Chrome. A macrotask boundary
      // guarantees the table's own transition has settled first.
      setTimeout(() => toast.success(`${coupon.code} ${payload.coupon.isActive ? 'reactivated' : 'deactivated'}`), 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the coupon.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button variant="brand" size="sm" onPress={() => setCreateOpen(true)}>
          <Plus className="size-4" strokeWidth={2.4} />
          New coupon
        </Button>
      </div>

      <Table aria-label="Promotions">
        <TableHeader>
          <TableHead isRowHeader>Code</TableHead>
          <TableHead>Discount</TableHead>
          <TableHead>Visibility</TableHead>
          <TableHead className="hidden sm:table-cell">Redemptions</TableHead>
          <TableHead className="hidden md:table-cell">Expires</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableHeader>
        <TableBody>
          {coupons.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>
                <p className="py-6 text-center text-sm text-muted">No coupons yet.</p>
              </TableCell>
            </TableRow>
          )}
          {coupons.map((c) => (
            <TableRow key={c._id}>
              <TableCell className="font-mono font-semibold text-foreground">{c.code}</TableCell>
              <TableCell>{discountText(c)}</TableCell>
              <TableCell>{c.isPublic ? 'Public' : 'Private'}</TableCell>
              <TableCell className="hidden sm:table-cell">
                {c.redemptionCount}
                {c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never'}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    c.isActive
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-border bg-default text-muted'
                  }`}
                >
                  {c.isActive ? 'Active' : 'Inactive'}
                </span>
              </TableCell>
              <TableCell>
                <Button variant="outline" size="sm" onPress={() => toggleActive(c)} isDisabled={busy}>
                  {c.isActive ? 'Deactivate' : 'Reactivate'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>New coupon</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="coupon-code">Code</Label>
              <Input
                id="coupon-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="LAUNCH20"
                className="font-mono uppercase"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-type">Type</Label>
                <Select ariaLabel="Type" value={type} onValueChange={(v) => setType((v as 'percent' | 'fixed') ?? 'percent')}>
                  <SelectItem value="percent">Percent off</SelectItem>
                  <SelectItem value="fixed">Fixed amount off</SelectItem>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-value">{type === 'percent' ? 'Percent (1-100)' : 'Amount (cents)'}</Label>
                <Input
                  id="coupon-value"
                  type="number"
                  min={1}
                  max={type === 'percent' ? 100 : undefined}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="coupon-max">Max redemptions (optional)</Label>
                <Input
                  id="coupon-max"
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  value={maxRedemptions}
                  onChange={(e) => setMaxRedemptions(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="coupon-expires">Expires on (optional)</Label>
                <Input
                  id="coupon-expires"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              Public — offer this code in Stripe Checkout&apos;s promo-code field
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onPress={() => setCreateOpen(false)} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="brand" onPress={createCoupon} isLoading={busy} loadingBehavior="disable">
              Create coupon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

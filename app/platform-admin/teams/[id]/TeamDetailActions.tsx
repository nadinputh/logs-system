'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectItem } from '@/components/ui/select'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { readApiError } from '@/lib/clientFetch'

type PlanOption = { _id: string; name: string; billingCycle: string }

export function TeamDetailActions({
  teamId,
  teamName,
  platformStatus,
  currentPlanName,
  subscriptionStatus,
  subscriptionProvider,
  grantReason,
  grantExpiresAt,
  availablePlans,
}: {
  teamId: string
  teamName: string
  platformStatus: string
  currentPlanName: string | null
  subscriptionStatus: string | null
  subscriptionProvider: string | null
  grantReason: string | null
  grantExpiresAt: string | null
  availablePlans: PlanOption[]
}) {
  const router = useRouter()
  const [grantOpen, setGrantOpen] = useState(false)
  const [planId, setPlanId] = useState(availablePlans[0]?._id ?? '')
  const [reason, setReason] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [busy, setBusy] = useState(false)

  async function submitGrant() {
    if (!planId || !reason.trim()) {
      toast.error('A plan and a reason are both required.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/platform-admin/teams/${teamId}/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          reason: reason.trim(),
          grantExpiresAt: expiresAt || null,
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not grant the plan.'))

      setGrantOpen(false)
      setReason('')
      setExpiresAt('')
      router.refresh()
      // Deferred to a separate macrotask, not just ordered after
      // router.refresh(): HeroUI's toast queue wraps every add in
      // document.startViewTransition(), which throws a benign
      // "InvalidStateError" in Chrome if it fires in the same tick as another
      // DOM-mutating update (the refreshed Plan/Status/Source card and/or the
      // Dialog's own closing transition) — React can still batch same-tick
      // statements into one flush regardless of source order. A macrotask
      // boundary guarantees those have settled first.
      setTimeout(() => toast.success(payload.note ?? `${teamName} granted the selected plan`), 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not grant the plan.')
    } finally {
      setBusy(false)
    }
  }

  async function revoke() {
    setBusy(true)
    try {
      const res = await fetch(`/api/platform-admin/teams/${teamId}/revoke`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not revoke the plan.'))
      router.refresh()
      setTimeout(() => toast.success(`${teamName} reset to Free`), 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not revoke the plan.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleSuspend() {
    const suspend = platformStatus !== 'suspended'
    setBusy(true)
    try {
      const res = await fetch(`/api/platform-admin/teams/${teamId}/suspend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suspend }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not update the team.'))
      router.refresh()
      setTimeout(() => toast.success(suspend ? `${teamName} suspended` : `${teamName} reactivated`), 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the team.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Plan</p>
              <p className="mt-1 text-sm font-medium text-foreground">{currentPlanName ?? 'No subscription'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Status</p>
              <p className="mt-1 text-sm font-medium capitalize text-foreground">
                {subscriptionStatus?.replace('_', ' ') ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Source</p>
              <p className="mt-1 text-sm font-medium capitalize text-foreground">{subscriptionProvider ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Platform status</p>
              <p className={`mt-1 text-sm font-medium ${platformStatus === 'suspended' ? 'text-danger' : 'text-foreground'}`}>
                {platformStatus === 'suspended' ? 'Suspended' : 'Active'}
              </p>
            </div>
          </div>
          {grantReason && (
            <p className="text-xs text-muted">
              Manual grant reason: “{grantReason}”
              {grantExpiresAt && ` — expires ${new Date(grantExpiresAt).toLocaleDateString()}`}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="brand" size="sm" onPress={() => setGrantOpen(true)} isDisabled={busy}>
              Grant / change plan
            </Button>
            <Button variant="outline" size="sm" onPress={revoke} isDisabled={busy || !currentPlanName}>
              Revoke → Free
            </Button>
            <Button
              variant={platformStatus === 'suspended' ? 'outline' : 'destructive'}
              size="sm"
              onPress={toggleSuspend}
              isDisabled={busy}
            >
              {platformStatus === 'suspended' ? 'Reactivate team' : 'Suspend team'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Grant a plan to {teamName}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="grant-plan">Plan</Label>
              <Select ariaLabel="Plan" value={planId} onValueChange={(v) => setPlanId(v ?? '')}>
                {availablePlans.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name} ({p.billingCycle})
                  </SelectItem>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-reason">Reason (required)</Label>
              <Input
                id="grant-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Partner comp, support goodwill, beta tester"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="grant-expires">Expires on (optional)</Label>
              <Input
                id="grant-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            {subscriptionProvider === 'stripe' && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                This team is currently paying via Stripe. Granting a plan will cancel that subscription
                immediately so they aren&apos;t double-charged.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onPress={() => setGrantOpen(false)} isDisabled={busy}>
              Cancel
            </Button>
            <Button variant="brand" onPress={submitGrant} isLoading={busy} loadingBehavior="disable">
              Grant plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

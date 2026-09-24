'use client'

import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { readApiError } from '@/lib/clientFetch'

type PlanLimits = {
  maxBuildings: number | null
  maxTeamMembers: number | null
  maxQuestCards: number | null
  logRetentionDays: number | null
  blePush: boolean
}

type PlanRow = {
  _id: string
  key: string
  name: string
  billingCycle: 'monthly' | 'annual'
  priceCents: number
  currency: string
  trialDays: number
  limits: PlanLimits
  isActive: boolean
}

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(
    cents / 100,
  )
}

function limitText(value: number | null) {
  return value === null ? 'Unlimited' : String(value)
}

export function PlansTable({ initialPlans }: { initialPlans: PlanRow[] }) {
  const [plans, setPlans] = useState(initialPlans)
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [saving, setSaving] = useState(false)

  // Draft fields, kept as strings so an emptied number input doesn't
  // immediately coerce to 0 mid-edit.
  const [draftLimits, setDraftLimits] = useState<Record<keyof Omit<PlanLimits, 'blePush'>, string>>({
    maxBuildings: '',
    maxTeamMembers: '',
    maxQuestCards: '',
    logRetentionDays: '',
  })
  const [draftBlePush, setDraftBlePush] = useState(false)
  const [draftTrialDays, setDraftTrialDays] = useState('0')
  const [draftIsActive, setDraftIsActive] = useState(true)

  function openEdit(plan: PlanRow) {
    setEditing(plan)
    setDraftLimits({
      maxBuildings: plan.limits.maxBuildings === null ? '' : String(plan.limits.maxBuildings),
      maxTeamMembers: plan.limits.maxTeamMembers === null ? '' : String(plan.limits.maxTeamMembers),
      maxQuestCards: plan.limits.maxQuestCards === null ? '' : String(plan.limits.maxQuestCards),
      logRetentionDays: plan.limits.logRetentionDays === null ? '' : String(plan.limits.logRetentionDays),
    })
    setDraftBlePush(plan.limits.blePush)
    setDraftTrialDays(String(plan.trialDays))
    setDraftIsActive(plan.isActive)
  }

  function parseLimit(raw: string): number | null {
    const trimmed = raw.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) && n >= 0 ? n : null
  }

  async function saveEdit() {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/platform-admin/plans/${editing._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trialDays: Number(draftTrialDays) || 0,
          isActive: draftIsActive,
          limits: {
            maxBuildings: parseLimit(draftLimits.maxBuildings),
            maxTeamMembers: parseLimit(draftLimits.maxTeamMembers),
            maxQuestCards: parseLimit(draftLimits.maxQuestCards),
            logRetentionDays: parseLimit(draftLimits.logRetentionDays),
            blePush: draftBlePush,
          },
        }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not update the plan.'))

      setPlans((current) => current.map((p) => (p._id === editing._id ? payload.plan : p)))
      setEditing(null)
      // Deferred to a separate macrotask: HeroUI's toast queue wraps every add
      // in document.startViewTransition(), which throws a benign
      // "InvalidStateError" in Chrome if it fires in the same tick as another
      // DOM-mutating React update (the table re-render and/or the Dialog's own
      // closing transition) — reordering the statements isn't enough on its
      // own, since React can still batch them into one flush. A macrotask
      // boundary guarantees those have settled first.
      setTimeout(() => toast.success(`${editing.name} (${editing.billingCycle}) updated`), 0)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the plan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Table aria-label="Plan catalog">
        <TableHeader>
          <TableHead isRowHeader>Plan</TableHead>
          <TableHead>Cycle</TableHead>
          <TableHead>Price</TableHead>
          <TableHead className="hidden md:table-cell">Buildings</TableHead>
          <TableHead className="hidden md:table-cell">Members</TableHead>
          <TableHead className="hidden lg:table-cell">Quest cards</TableHead>
          <TableHead className="hidden lg:table-cell">Retention</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableHeader>
        <TableBody>
          {plans.map((plan) => (
            <TableRow key={plan._id}>
              <TableCell>
                <span className="font-semibold text-foreground">{plan.name}</span>
                <span className="ml-1.5 font-mono text-xs text-muted">{plan.key}</span>
              </TableCell>
              <TableCell className="capitalize">{plan.billingCycle}</TableCell>
              <TableCell className="tabular">{money(plan.priceCents, plan.currency)}</TableCell>
              <TableCell className="hidden md:table-cell">{limitText(plan.limits.maxBuildings)}</TableCell>
              <TableCell className="hidden md:table-cell">{limitText(plan.limits.maxTeamMembers)}</TableCell>
              <TableCell className="hidden lg:table-cell">{limitText(plan.limits.maxQuestCards)}</TableCell>
              <TableCell className="hidden lg:table-cell">
                {plan.limits.logRetentionDays === null ? 'Unlimited' : `${plan.limits.logRetentionDays}d`}
              </TableCell>
              <TableCell>
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                    plan.isActive
                      ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                      : 'border-border bg-default text-muted'
                  }`}
                >
                  {plan.isActive ? 'Active' : 'Inactive'}
                </span>
              </TableCell>
              <TableCell>
                <Button variant="outline" size="icon-sm" onPress={() => openEdit(plan)} aria-label={`Edit ${plan.name} ${plan.billingCycle}`}>
                  <Pencil className="size-4" strokeWidth={2.2} />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>
              Edit {editing?.name} ({editing?.billingCycle})
            </DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="maxBuildings">Max buildings</Label>
                <Input
                  id="maxBuildings"
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  value={draftLimits.maxBuildings}
                  onChange={(e) => setDraftLimits((d) => ({ ...d, maxBuildings: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxTeamMembers">Max team members</Label>
                <Input
                  id="maxTeamMembers"
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  value={draftLimits.maxTeamMembers}
                  onChange={(e) => setDraftLimits((d) => ({ ...d, maxTeamMembers: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="maxQuestCards">Max quest cards</Label>
                <Input
                  id="maxQuestCards"
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  value={draftLimits.maxQuestCards}
                  onChange={(e) => setDraftLimits((d) => ({ ...d, maxQuestCards: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="logRetentionDays">Log retention (days)</Label>
                <Input
                  id="logRetentionDays"
                  type="number"
                  min={0}
                  placeholder="Unlimited"
                  value={draftLimits.logRetentionDays}
                  onChange={(e) => setDraftLimits((d) => ({ ...d, logRetentionDays: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trialDays">Trial days</Label>
                <Input
                  id="trialDays"
                  type="number"
                  min={0}
                  value={draftTrialDays}
                  onChange={(e) => setDraftTrialDays(e.target.value)}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={draftBlePush}
                onChange={(e) => setDraftBlePush(e.target.checked)}
              />
              BLE push notifications included
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={draftIsActive}
                onChange={(e) => setDraftIsActive(e.target.checked)}
              />
              Active (offered to new checkouts)
            </label>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onPress={() => setEditing(null)} isDisabled={saving}>
              Cancel
            </Button>
            <Button variant="brand" onPress={saveEdit} isLoading={saving} loadingBehavior="disable">
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Download, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogIcon, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/components/ui/sonner'
import { readApiError } from '@/lib/clientFetch'

type PlanRow = {
  _id: string
  key: string
  name: string
  billingCycle: 'monthly' | 'annual'
  priceCents: number
  currency: string
  trialDays: number
  limits: { maxTeamMembers: number | null; maxBuildings: number | null }
}

type InvoiceRow = {
  number: string
  status: 'paid' | 'payment_failed'
  amountCents: number
  currency: string
  issuedAt: string
  pdfUrl?: string | null
}

type BillingInfo = {
  stripeConfigured: boolean
  billingMode: 'stripe' | 'mock'
  subscription: {
    status: string
    provider: 'stripe' | 'manual' | 'mock' | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    trialEndsAt: string | null
    hasStripeCustomer: boolean
    grantReason: string | null
  } | null
  currentPlan: { _id: string; name: string; billingCycle: string; priceCents: number; currency: string } | null
  plans: PlanRow[]
  invoices: InvoiceRow[]
  teamUsage: { activeMembers: number; activeBuildings: number }
}

/** Mirrors enforcePlanLimitsAfterDowngrade's math (lib/entitlements.ts) so the
 * confirm dialog can preview its fallout before the owner commits, not after. */
function downgradeImpact(plan: PlanRow, usage: BillingInfo['teamUsage']) {
  const members = plan.limits.maxTeamMembers != null
    ? Math.max(0, usage.activeMembers - (plan.limits.maxTeamMembers - 1))
    : 0
  const buildings = plan.limits.maxBuildings != null
    ? Math.max(0, usage.activeBuildings - plan.limits.maxBuildings)
    : 0
  return { members, buildings }
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

const STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  trialing: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  past_due: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  canceled: 'border-border bg-default text-muted',
  incomplete: 'border-border bg-default text-muted',
}

export function TeamBillingCard({ teamId, isOwner }: { teamId: string; isOwner: boolean }) {
  const [info, setInfo] = useState<BillingInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)
  // A live (non-canceled) subscription switching plans mutates in place with
  // no redirect and no checkout page to serve as its own confirmation — see
  // the P0 fix in the checkout route. This dialog is that missing gate for
  // exactly that case; a fresh subscribe or a resubscribe-after-cancellation
  // redirects to a real checkout session instead, which already confirms
  // itself, so those skip straight to startCheckout below.
  const [confirmPlan, setConfirmPlan] = useState<PlanRow | null>(null)
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')

  function loadBillingInfo(cancelledRef?: { current: boolean }) {
    return fetch(`/api/teams/${teamId}/billing`)
      .then((res) => res.json())
      .then((payload) => {
        if (cancelledRef?.current) return
        setInfo(payload)
        if (payload.currentPlan?.billingCycle) setCycle(payload.currentPlan.billingCycle)
      })
      .catch(() => {
        if (!cancelledRef?.current) toast.error('Could not load billing information.')
      })
  }

  useEffect(() => {
    const cancelledRef = { current: false }
    setLoading(true)
    loadBillingInfo(cancelledRef).finally(() => {
      if (!cancelledRef.current) setLoading(false)
    })
    return () => {
      cancelledRef.current = true
    }
  }, [teamId])

  // Surfaces the redirect back from Checkout (real Stripe or the dev-mode
  // mock — both land here via successUrl/cancelUrl with the same query).
  useEffect(() => {
    const url = new URL(window.location.href)
    const billing = url.searchParams.get('billing')
    if (billing === 'success') toast.success('Subscription active — welcome aboard.')
    else if (billing === 'canceled') toast('Checkout canceled — no changes were made.')
    if (billing) {
      url.searchParams.delete('billing')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  async function startCheckout(planId: string) {
    setBusyPlanId(planId)
    try {
      const res = await fetch(`/api/teams/${teamId}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not start checkout.'))
      if (payload.changed) {
        // Existing live Stripe subscription updated in place (proration) —
        // nothing to redirect to. Refresh so the card shows the new plan.
        await loadBillingInfo()
        toast.success('Plan updated')
        setBusyPlanId(null)
        return
      }
      window.location.href = payload.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start checkout.')
      setBusyPlanId(null)
    }
  }

  async function openPortal() {
    setPortalBusy(true)
    try {
      const res = await fetch(`/api/teams/${teamId}/billing/portal`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not open the billing portal.'))
      window.location.href = payload.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the billing portal.')
      setPortalBusy(false)
    }
  }

  if (!isOwner) {
    return (
      <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
        Only the team owner can manage billing.
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-sm text-muted">
        Loading billing information...
      </div>
    )
  }

  if (!info || !info.stripeConfigured) {
    return (
      <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
        Billing is not available in this environment yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {info.subscription ? (
        // The one surface in this card that earns Glass Vault treatment —
        // this is the highest-trust moment on the page (what am I paying,
        // what state is it in), so it gets real elevation instead of sitting
        // flush with the flat plan tiles and invoice rows around it.
        // DESIGN.md's glass is a See-Through-At-Rest surface, not just a
        // blurred box — on the flat neutral ground this card would otherwise
        // sit on, backdrop-blur has nothing colorful to reveal, so the same
        // ambient-wash tint the landing hero uses goes behind it, contained
        // to just this card (overflow-hidden), not bleeding into the flat
        // plan tiles beside it.
        <div className="relative overflow-hidden rounded-3xl">
          <div aria-hidden className="ambient-wash pointer-events-none absolute inset-0" />
          <div className="glass shadow-panel relative z-10 rounded-3xl px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-lg font-extrabold text-foreground">
                {info.currentPlan ? `${info.currentPlan.name} (${info.currentPlan.billingCycle})` : 'No plan'}
              </p>
              {info.subscription.status === 'trialing' && info.subscription.trialEndsAt ? (
                <p className="text-xs text-muted">
                  Trial ends {new Date(info.subscription.trialEndsAt).toLocaleDateString()}
                  {info.currentPlan &&
                    `, then renews at ${formatPrice(info.currentPlan.priceCents, info.currentPlan.currency)}/${
                      info.currentPlan.billingCycle === 'annual' ? 'year' : 'month'
                    }`}
                </p>
              ) : (
                info.subscription.currentPeriodEnd && (
                  <p className="text-xs text-muted">
                    {info.subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on{' '}
                    {new Date(info.subscription.currentPeriodEnd).toLocaleDateString()}
                  </p>
                )
              )}
              {info.subscription.grantReason && (
                <p className="text-xs text-muted">Manually granted — {info.subscription.grantReason}</p>
              )}
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                STATUS_STYLES[info.subscription.status] ?? STATUS_STYLES.canceled
              }`}
            >
              {info.subscription.status.replace('_', ' ')}
            </span>
          </div>
          {info.subscription.provider &&
            info.subscription.provider !== 'manual' &&
            info.subscription.hasStripeCustomer && (
            <div className="mt-3">
              <Button size="sm" variant="outline" onPress={openPortal} isLoading={portalBusy} loadingBehavior="disable">
                Manage billing
              </Button>
            </div>
          )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted">
          This team has no plan yet.
        </div>
      )}

      {info.plans.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Available plans</p>
            <div className="inline-flex rounded-full bg-muted/40 p-0.5">
              <Button size="sm" variant={cycle === 'monthly' ? 'brand' : 'ghost'} onPress={() => setCycle('monthly')}>
                Monthly
              </Button>
              <Button size="sm" variant={cycle === 'annual' ? 'brand' : 'ghost'} onPress={() => setCycle('annual')}>
                Annual — save ~17%
              </Button>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {info.plans
              .filter((plan) => plan.billingCycle === cycle)
              .map((plan) => {
                const isCurrent = info.currentPlan?._id === plan._id
                // Only a LIVE subscription (not canceled) mutates in place with
                // no checkout redirect to confirm itself — gate that one case.
                const needsConfirm = Boolean(info.subscription) && info.subscription!.status !== 'canceled'
                return (
                  <div key={plan._id} className="flex flex-col justify-between gap-3 rounded-lg bg-muted/20 px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{plan.name}</p>
                      <p className="text-sm text-muted">{formatPrice(plan.priceCents, plan.currency)}</p>
                      {plan.trialDays > 0 && !info.subscription && (
                        <p className="text-xs text-muted">{plan.trialDays}-day free trial</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isCurrent ? 'outline' : 'brand'}
                      isDisabled={isCurrent || busyPlanId === plan._id}
                      isLoading={busyPlanId === plan._id}
                      loadingBehavior="disable"
                      onPress={() => (needsConfirm ? setConfirmPlan(plan) : startCheckout(plan._id))}
                    >
                      {isCurrent ? 'Current plan' : info.subscription ? 'Switch to this plan' : 'Subscribe'}
                    </Button>
                  </div>
                )
              })}
          </div>
        </div>
      )}

      {info.invoices.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Invoices</p>
          <div className="divide-y divide-border">
            {info.invoices.map((inv) => (
              <div key={inv.number} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2 text-sm">
                <span className="text-foreground">{inv.number}</span>
                <span className={inv.status === 'paid' ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'font-medium text-danger'}>
                  {formatPrice(inv.amountCents, inv.currency)} — {inv.status.replace('_', ' ')}
                </span>
                <span className="text-xs text-muted">{new Date(inv.issuedAt).toLocaleDateString()}</span>
                {inv.pdfUrl && (
                  <a
                    href={inv.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                  >
                    <Download className="size-3.5" aria-hidden />
                    PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {info.billingMode === 'mock' && (
        <p className="text-center text-xs text-muted">Billing is running in dev-mode bypass — no real charges occur.</p>
      )}

      <Dialog open={Boolean(confirmPlan)} onOpenChange={(open) => { if (!open) setConfirmPlan(null) }}>
        <DialogContent size="xs">
          {confirmPlan && (() => {
            const impact = downgradeImpact(confirmPlan, info.teamUsage)
            const isDowngrade = impact.members > 0 || impact.buildings > 0
            return (
            <>
              <DialogHeader>
                <DialogIcon
                  className={
                    isDowngrade
                      ? 'size-12 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      : 'size-12 rounded-full bg-[var(--accent)]/10 text-[var(--accent)]'
                  }
                >
                  {isDowngrade ? <TriangleAlert className="size-5" aria-hidden /> : <CreditCard className="size-5" aria-hidden />}
                </DialogIcon>
                <DialogTitle className="mt-4 text-xl font-semibold tracking-normal">
                  Switch to {confirmPlan.name} ({confirmPlan.billingCycle})?
                </DialogTitle>
              </DialogHeader>
              <DialogBody className="mt-3 text-sm leading-6 text-muted">
                {info.currentPlan?.name ?? 'Your current plan'} is replaced by {confirmPlan.name} at{' '}
                {formatPrice(confirmPlan.priceCents, confirmPlan.currency)} / {confirmPlan.billingCycle === 'annual' ? 'year' : 'month'}
                , effective immediately — prorated, not queued for the next renewal.
                {isDowngrade && (
                  <p className="mt-2 font-medium text-amber-700 dark:text-amber-400">
                    This will{' '}
                    {impact.members > 0 && `suspend ${impact.members} team member${impact.members === 1 ? '' : 's'}`}
                    {impact.members > 0 && impact.buildings > 0 && ' and '}
                    {impact.buildings > 0 && `archive ${impact.buildings} building${impact.buildings === 1 ? '' : 's'}`}
                    {' '}to fit {confirmPlan.name}&apos;s limits. Both are reversible from Members and Buildings afterward.
                  </p>
                )}
              </DialogBody>
              <DialogFooter className="mt-5 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => setConfirmPlan(null)}
                  isDisabled={busyPlanId === confirmPlan._id}
                >
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  onPress={() => {
                    const planId = confirmPlan._id
                    setConfirmPlan(null)
                    startCheckout(planId)
                  }}
                >
                  Switch plan
                </Button>
              </DialogFooter>
            </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}

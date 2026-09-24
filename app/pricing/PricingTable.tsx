'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { readApiError } from '@/lib/clientFetch'

export type PricingPlan = {
  id: string
  key: string
  name: string
  billingCycle: 'monthly' | 'annual'
  priceCents: number
  currency: string
  trialDays: number
  limits: {
    maxBuildings: number | null
    maxTeamMembers: number | null
    maxQuestCards: number | null
    logRetentionDays: number | null
    blePush: boolean
  }
}

type Tier = { monthly?: PricingPlan; annual?: PricingPlan }

type TeamState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'no-team' }
  | { status: 'member' }
  | { status: 'owner'; teamId: string; currentPlanId: string | null; currentPlanKey: string | null; hasStripeCustomer: boolean }

function formatPrice(cents: number, currency: string) {
  if (cents === 0) return '$0'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(
    cents / 100,
  )
}

function featureLines(limits: PricingPlan['limits']) {
  const lines: string[] = []
  lines.push(limits.maxBuildings == null ? 'Unlimited buildings' : `${limits.maxBuildings} building${limits.maxBuildings === 1 ? '' : 's'}`)
  lines.push(limits.maxTeamMembers == null ? 'Unlimited team members' : `${limits.maxTeamMembers} team members`)
  lines.push(limits.maxQuestCards == null ? 'Unlimited quest cards' : `${limits.maxQuestCards} quest card${limits.maxQuestCards === 1 ? '' : 's'}`)
  lines.push(limits.logRetentionDays == null ? 'Unlimited log retention' : `${limits.logRetentionDays}-day log retention`)
  if (limits.blePush) lines.push('BLE beacon push notifications')
  return lines
}

export function PricingTable({ plans }: { plans: Tier[] }) {
  const [cycle, setCycle] = useState<'monthly' | 'annual'>('monthly')
  const [team, setTeam] = useState<TeamState>({ status: 'loading' })
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null)
  const [portalBusy, setPortalBusy] = useState(false)

  async function loadTeamState(cancelledRef?: { current: boolean }) {
    try {
      const res = await fetch('/api/teams')
      if (res.status === 401) {
        if (!cancelledRef?.current) setTeam({ status: 'anonymous' })
        return
      }
      const payload = await res.json().catch(() => ({}))
      const activeTeam = (payload.teams ?? []).find((t: { isActive: boolean }) => t.isActive)
      if (!activeTeam) {
        if (!cancelledRef?.current) setTeam({ status: 'no-team' })
        return
      }

      const billingRes = await fetch(`/api/teams/${activeTeam.id}/billing`)
      if (billingRes.status === 403) {
        if (!cancelledRef?.current) setTeam({ status: 'member' })
        return
      }
      const billingPayload = await billingRes.json().catch(() => ({}))
      if (!cancelledRef?.current) {
        setTeam({
          status: 'owner',
          teamId: activeTeam.id,
          currentPlanId: billingPayload.currentPlan?._id ?? null,
          currentPlanKey: billingPayload.currentPlan?.key ?? null,
          hasStripeCustomer: Boolean(billingPayload.subscription?.hasStripeCustomer),
        })
      }
    } catch {
      if (!cancelledRef?.current) setTeam({ status: 'anonymous' })
    }
  }

  useEffect(() => {
    const cancelledRef = { current: false }
    void loadTeamState(cancelledRef)
    return () => {
      cancelledRef.current = true
    }
  }, [])

  async function subscribe(planId: string) {
    if (team.status !== 'owner') return
    setBusyPlanId(planId)
    try {
      const res = await fetch(`/api/teams/${team.teamId}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not start checkout.'))
      if (payload.changed) {
        // An existing live Stripe subscription was updated in place
        // (proration) rather than sent through a new Checkout Session —
        // nothing to redirect to. Refresh so the "Current plan" badge moves.
        await loadTeamState()
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
    if (team.status !== 'owner') return
    setPortalBusy(true)
    try {
      const res = await fetch(`/api/teams/${team.teamId}/billing/portal`, { method: 'POST' })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not open the billing portal.'))
      window.location.href = payload.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not open the billing portal.')
      setPortalBusy(false)
    }
  }

  function renderCta(row: PricingPlan | undefined) {
    if (!row) return null
    const isFree = row.priceCents === 0

    if (team.status === 'loading') {
      return (
        <Button variant="outline" size="touch" className="w-full" isDisabled>
          Loading…
        </Button>
      )
    }

    if (team.status === 'anonymous') {
      return (
        <Link
          href="/register"
          className="gradient-cta shadow-signal press flex h-12 w-full items-center justify-center rounded-full px-7 text-sm font-semibold text-[var(--accent-foreground)]"
        >
          {isFree ? 'Get started free' : 'Get started'}
        </Link>
      )
    }

    if (team.status === 'no-team') {
      return (
        <Link
          href="/settings/team"
          className="flex h-12 w-full items-center justify-center rounded-full border border-border px-7 text-sm font-semibold text-foreground transition-colors hover:bg-default"
        >
          Create a team first
        </Link>
      )
    }

    if (team.status === 'member') {
      return (
        <Button variant="outline" size="touch" className="w-full" isDisabled>
          Ask your team owner
        </Button>
      )
    }

    // owner — matched by plan key (free/pro/business), not the exact row id:
    // the monthly/annual toggle is a display choice, so "you're already on
    // Free" should hold regardless of which cycle happens to be selected.
    const isCurrent = row.key === team.currentPlanKey
    if (isCurrent) {
      return (
        <Button variant="outline" size="touch" className="w-full" isDisabled>
          Current plan
        </Button>
      )
    }
    if (isFree) {
      if (!team.hasStripeCustomer) {
        // A manual comp (superadmin grant) has no Stripe subscription to
        // cancel — there is no self-serve path off of it, so say so instead
        // of offering a portal button that will just 404.
        return (
          <Button variant="outline" size="touch" className="w-full" isDisabled>
            Contact your administrator
          </Button>
        )
      }
      return (
        <Button variant="outline" size="touch" className="w-full" onPress={openPortal} isLoading={portalBusy} loadingBehavior="disable">
          Manage billing to downgrade
        </Button>
      )
    }
    return (
      <Button
        variant="brand"
        size="touch"
        className="w-full"
        onPress={() => subscribe(row.id)}
        isLoading={busyPlanId === row.id}
        loadingBehavior="disable"
      >
        {team.currentPlanId ? 'Switch to this plan' : 'Subscribe'}
      </Button>
    )
  }

  return (
    <div className="mt-12">
      <div className="mx-auto flex w-fit items-center gap-1 rounded-full border border-[var(--panel-border)] bg-overlay/70 p-1">
        <button
          type="button"
          onClick={() => setCycle('monthly')}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            cycle === 'monthly' ? 'bg-accent text-[var(--accent-foreground)]' : 'text-muted hover:text-foreground'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setCycle('annual')}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            cycle === 'annual' ? 'bg-accent text-[var(--accent-foreground)]' : 'text-muted hover:text-foreground'
          }`}
        >
          Annual <span className="text-xs font-normal opacity-80">— 2 months free</span>
        </button>
      </div>

      <div className="mx-auto mt-10 grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((tier) => {
          const row = tier[cycle] ?? tier.monthly ?? tier.annual
          if (!row) return null
          const isFeatured = row.key === 'pro'

          return (
            <div
              key={row.key}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                isFeatured ? 'border-accent/40 bg-accent/5 shadow-lg shadow-accent/10' : 'border-[var(--panel-border)] bg-overlay/40'
              }`}
            >
              {isFeatured && (
                <span className="absolute -top-3 left-6 rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-[var(--accent-foreground)]">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-bold tracking-tight">{row.name}</h3>
              <p className="mt-3">
                <span className="text-4xl font-extrabold tracking-tight">{formatPrice(row.priceCents, row.currency)}</span>
                {row.priceCents > 0 && <span className="text-sm font-medium text-muted"> / {cycle === 'monthly' ? 'month' : 'year'}</span>}
              </p>
              {row.trialDays > 0 && <p className="mt-1 text-sm text-muted">{row.trialDays}-day free trial</p>}

              <ul className="mt-6 flex-1 space-y-2.5">
                {featureLines(row.limits).map((line) => (
                  <li key={line} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-[var(--accent)]" strokeWidth={2.4} />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6">{renderCta(row)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/sonner'
import { readApiError } from '@/lib/clientFetch'

const OUTCOMES: Array<{ key: string; label: string; variant: 'brand' | 'outline' | 'destructive' | 'ghost' }> = [
  { key: 'success', label: 'Pay — Success', variant: 'brand' },
  { key: 'card_declined', label: 'Decline — Generic', variant: 'outline' },
  { key: 'insufficient_funds', label: 'Decline — Insufficient funds', variant: 'outline' },
  { key: 'expired_card', label: 'Decline — Expired card', variant: 'outline' },
  { key: 'processing_error', label: 'Decline — Processing error', variant: 'outline' },
  { key: 'requires_authentication', label: 'Decline — Requires authentication', variant: 'outline' },
  { key: 'canceled', label: 'Cancel and go back', variant: 'ghost' },
]

export function MockCheckoutActions({ token }: { token: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [declineMessage, setDeclineMessage] = useState<string | null>(null)

  async function pick(outcome: string) {
    setBusy(outcome)
    setDeclineMessage(null)
    try {
      const res = await fetch(`/api/dev/billing/checkout/${token}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      const payload = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(readApiError(payload, 'Could not complete the mock checkout.'))

      if (payload.declined) {
        setDeclineMessage(payload.message)
        toast.error(payload.message)
        setBusy(null)
        return
      }

      window.location.href = payload.url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not complete the mock checkout.')
      setBusy(null)
    }
  }

  return (
    <div className="space-y-3">
      {declineMessage && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {declineMessage} Pick another outcome to retry, same as a real Checkout page.
        </div>
      )}
      <div className="grid gap-2">
        {OUTCOMES.map((o) => (
          <Button
            key={o.key}
            variant={o.variant}
            // HeroUI's outline/ghost buttons size purely via a fixed
            // border-box height with flex-centered content — real padding is
            // 0 by construction, not by neglect. This explicit padding
            // barely changes the rendered height (border-box keeps most of
            // it absorbed by the fixed height class), but it does give the
            // label a real padding value rather than none.
            className="py-1.5"
            isDisabled={busy !== null}
            isLoading={busy === o.key}
            loadingBehavior="disable"
            onPress={() => pick(o.key)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

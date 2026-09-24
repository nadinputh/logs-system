import { notFound } from 'next/navigation'
import { mockBillingEnabled } from '@/lib/billing/provider'
import { getMockCheckoutSession } from '@/lib/billing/mockCheckout'
import { MockCheckoutActions } from '@/components/dev/MockCheckoutActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export default async function MockCheckoutPage({ params }: { params: Promise<{ token: string }> }) {
  if (!mockBillingEnabled()) notFound()

  const { token } = await params
  const session = await getMockCheckoutSession(token)
  if (!session) notFound()

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        Dev mode — mock checkout (BILLING_MOCK_MODE)
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-6 shadow-sm">
        <p className="text-sm text-muted">{session.teamName}</p>
        <h1 className="mt-1 text-xl font-extrabold text-foreground">
          {session.plan.name} <span className="font-normal text-muted">({session.plan.billingCycle})</span>
        </h1>
        <p className="mt-1 text-3xl font-extrabold text-foreground">
          {formatPrice(session.plan.priceCents, session.plan.currency)}
          <span className="text-sm font-normal text-muted"> / {session.plan.billingCycle === 'annual' ? 'year' : 'month'}</span>
        </p>
        {session.plan.trialDays > 0 && (
          <p className="mt-1 text-sm text-muted">{session.plan.trialDays}-day free trial — no charge today</p>
        )}

        <div className="mt-6">
          {session.consumed ? (
            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-sm text-muted">
              This mock checkout session was already completed. Start a new checkout from Settings → Billing to try
              another outcome.
            </p>
          ) : (
            <MockCheckoutActions token={session.token} />
          )}
        </div>
      </div>
    </div>
  )
}

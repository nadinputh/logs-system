import { notFound } from 'next/navigation'
import { mockBillingEnabled } from '@/lib/billing/provider'
import { getMockPortalData } from '@/lib/billing/mockPortal'
import { MockPortalActions } from '@/components/dev/MockPortalActions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  active: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  trialing: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  past_due: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  canceled: 'border-border bg-default text-muted',
}

function formatPrice(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100)
}

export default async function MockPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>
  searchParams: Promise<{ return?: string }>
}) {
  if (!mockBillingEnabled()) notFound()

  const { customerId } = await params
  const { return: returnUrl } = await searchParams
  const data = await getMockPortalData(customerId)
  if (!data) notFound()

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
        Dev mode — mock billing portal (BILLING_MOCK_MODE)
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted">{data.teamName}</p>
            <h1 className="text-3xl font-extrabold text-foreground">
              {data.planName} <span className="font-normal text-muted">({data.billingCycle})</span>
            </h1>
          </div>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
              STATUS_STYLES[data.status] ?? STATUS_STYLES.canceled
            }`}
          >
            {data.status.replace('_', ' ')}
          </span>
        </div>
        {data.currentPeriodEnd && (
          <p className="mt-1 text-xs text-muted">
            {data.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on {new Date(data.currentPeriodEnd).toLocaleDateString()}
          </p>
        )}

        <div className="mt-6">
          <MockPortalActions customerId={data.customerId} returnUrl={returnUrl ?? '/settings/team'} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-6 shadow-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Invoices</p>
        {data.invoices.length === 0 ? (
          <p className="text-sm text-muted">No invoices issued yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.invoices.map((inv) => (
              <li key={inv.number} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                <span className="text-foreground">{inv.number}</span>
                <span className={inv.status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-danger'}>
                  {formatPrice(inv.amountCents, inv.currency)} — {inv.status.replace('_', ' ')}
                </span>
                <span className="w-full text-xs text-muted sm:w-auto">{new Date(inv.issuedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
